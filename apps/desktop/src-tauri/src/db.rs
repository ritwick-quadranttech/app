use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use rusqlite::types::{ToSqlOutput, Value, ValueRef};
use rusqlite::{Connection, OpenFlags, ToSql, TransactionBehavior};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompanyInfo {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub db_filename: String,
    pub is_last_opened: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct CompanyRegistry {
    pub last_opened_id: Option<String>,
    pub companies: Vec<CompanyInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatementInput {
    pub sql: String,
    pub params: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}]: {}", self.code, self.message)
    }
}

impl std::error::Error for DbError {}

pub struct ActiveConnection {
    pub company_id: String,
    pub conn: Connection,
}

pub struct DbState {
    pub app_data_dir: PathBuf,
    pub active_conn: Mutex<Option<ActiveConnection>>,
}

impl DbState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&app_data_dir);
        let _ = fs::create_dir_all(app_data_dir.join("companies"));
        let _ = fs::create_dir_all(app_data_dir.join("backups"));

        Self {
            app_data_dir,
            active_conn: Mutex::new(None),
        }
    }

    fn registry_path(&self) -> PathBuf {
        self.app_data_dir.join("companies.json")
    }

    pub fn read_registry(&self) -> CompanyRegistry {
        let path = self.registry_path();
        if !path.exists() {
            return CompanyRegistry::default();
        }
        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => CompanyRegistry::default(),
        }
    }

    pub fn write_registry(&self, reg: &CompanyRegistry) -> Result<(), DbError> {
        let path = self.registry_path();
        let content = serde_json::to_string_pretty(reg).map_err(|e| DbError {
            code: "REGISTRY_SERIALIZE_ERROR".into(),
            message: e.to_string(),
        })?;
        fs::write(path, content).map_err(|e| DbError {
            code: "REGISTRY_WRITE_ERROR".into(),
            message: e.to_string(),
        })
    }

    pub fn company_db_path(&self, id: &str) -> PathBuf {
        self.app_data_dir.join("companies").join(format!("{}.sqlite", id))
    }

    pub fn open_connection_for_file(path: &Path) -> Result<Connection, DbError> {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| DbError {
            code: "SQLITE_OPEN_ERROR".into(),
            message: e.to_string(),
        })?;

        // Configure required SQLite pragmas
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| DbError {
                code: "PRAGMA_ERROR".into(),
                message: format!("Failed to set journal_mode=WAL: {}", e),
            })?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| DbError {
                code: "PRAGMA_ERROR".into(),
                message: format!("Failed to set foreign_keys=ON: {}", e),
            })?;
        conn.pragma_update(None, "busy_timeout", 5000)
            .map_err(|e| DbError {
                code: "PRAGMA_ERROR".into(),
                message: format!("Failed to set busy_timeout=5000: {}", e),
            })?;

        Ok(conn)
    }
}

/// Convert JSON value to SQLite parameter wrapper
struct JsonParam(serde_json::Value);

impl ToSql for JsonParam {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        match &self.0 {
            serde_json::Value::Null => Ok(ToSqlOutput::from(Value::Null)),
            serde_json::Value::Bool(b) => Ok(ToSqlOutput::from(if *b { 1 } else { 0 })),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Ok(ToSqlOutput::from(i))
                } else if let Some(u) = n.as_u64() {
                    Ok(ToSqlOutput::from(u as i64))
                } else if let Some(f) = n.as_f64() {
                    Ok(ToSqlOutput::from(f))
                } else {
                    Ok(ToSqlOutput::from(Value::Null))
                }
            }
            serde_json::Value::String(s) => Ok(ToSqlOutput::from(s.as_str())),
            serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
                Ok(ToSqlOutput::from(self.0.to_string()))
            }
        }
    }
}

/// Convert SQLite value to serde_json::Value
fn value_ref_to_json(val: ValueRef<'_>) -> serde_json::Value {
    match val {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(i) => serde_json::Value::Number(i.into()),
        ValueRef::Real(f) => serde_json::Number::from_f64(f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        ValueRef::Text(t) => {
            let s = String::from_utf8_lossy(t).into_owned();
            serde_json::Value::String(s)
        }
        ValueRef::Blob(b) => {
            serde_json::Value::Array(b.iter().map(|&byte| serde_json::Value::from(byte)).collect())
        }
    }
}

pub fn execute_query(
    conn: &Connection,
    sql: &str,
    params: &[serde_json::Value],
) -> Result<Vec<Vec<serde_json::Value>>, DbError> {
    let trimmed = sql.trim();
    let upper = trimmed.to_uppercase();

    // Check read-only query prefix
    if !upper.starts_with("SELECT")
        && !upper.starts_with("WITH")
        && !upper.starts_with("PRAGMA")
        && !upper.starts_with("EXPLAIN")
    {
        return Err(DbError {
            code: "READONLY_VIOLATION".into(),
            message: format!("db_query only permits read-only SELECT statements: {}", trimmed),
        });
    }

    let mut stmt = conn.prepare(trimmed).map_err(|e| DbError {
        code: "SQLITE_PREPARE_ERROR".into(),
        message: e.to_string(),
    })?;

    if !stmt.readonly() {
        return Err(DbError {
            code: "READONLY_VIOLATION".into(),
            message: "SQLite reports this statement is not readonly.".into(),
        });
    }

    let param_wrappers: Vec<JsonParam> = params.iter().cloned().map(JsonParam).collect();
    let rusqlite_params = rusqlite::params_from_iter(param_wrappers.iter());

    let mut rows = stmt.query(rusqlite_params).map_err(|e| DbError {
        code: "SQLITE_QUERY_ERROR".into(),
        message: e.to_string(),
    })?;

    let col_count = stmt.column_count();
    let mut results: Vec<Vec<serde_json::Value>> = Vec::new();

    while let Some(row) = rows.next().map_err(|e| DbError {
        code: "SQLITE_ROW_ERROR".into(),
        message: e.to_string(),
    })? {
        let mut row_vals = Vec::with_capacity(col_count);
        for i in 0..col_count {
            let val_ref = row.get_ref(i).map_err(|e| DbError {
                code: "SQLITE_CELL_ERROR".into(),
                message: e.to_string(),
            })?;
            row_vals.push(value_ref_to_json(val_ref));
        }
        results.push(row_vals);
    }

    Ok(results)
}

pub fn execute_batch(
    conn: &mut Connection,
    statements: &[StatementInput],
) -> Result<usize, DbError> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| DbError {
            code: "TX_BEGIN_ERROR".into(),
            message: format!("Failed to begin immediate transaction: {}", e),
        })?;

    let mut total_affected = 0;

    for stmt_input in statements {
        let trimmed = stmt_input.sql.trim();
        let mut stmt = tx.prepare(trimmed).map_err(|e| DbError {
            code: "SQLITE_PREPARE_ERROR".into(),
            message: format!("Failed to prepare '{}': {}", trimmed, e),
        })?;

        let param_wrappers: Vec<JsonParam> =
            stmt_input.params.iter().cloned().map(JsonParam).collect();
        let rusqlite_params = rusqlite::params_from_iter(param_wrappers.iter());

        if stmt.column_count() > 0 {
            // Statement returns rows (e.g. UPDATE ... RETURNING)
            let mut rows = stmt.query(rusqlite_params).map_err(|e| DbError {
                code: "SQLITE_EXECUTE_ERROR".into(),
                message: format!("Failed to execute '{}': {}", trimmed, e),
            })?;
            let mut count = 0;
            while let Some(_) = rows.next().map_err(|e| DbError {
                code: "SQLITE_ROW_ERROR".into(),
                message: e.to_string(),
            })? {
                count += 1;
            }
            total_affected += count;
        } else {
            let affected = stmt.execute(rusqlite_params).map_err(|e| DbError {
                code: "SQLITE_EXECUTE_ERROR".into(),
                message: format!("Failed to execute '{}': {}", trimmed, e),
            })?;
            total_affected += affected;
        }
    }

    tx.commit().map_err(|e| DbError {
        code: "TX_COMMIT_ERROR".into(),
        message: format!("Failed to commit batch transaction: {}", e),
    })?;

    Ok(total_affected)
}

pub fn snapshot_database(src_conn: &Connection, dest_path: &Path) -> Result<(), DbError> {
    if let Some(parent) = dest_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut dest_conn = Connection::open_with_flags(
        dest_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| DbError {
        code: "SNAPSHOT_OPEN_ERROR".into(),
        message: e.to_string(),
    })?;

    let backup = rusqlite::backup::Backup::new(src_conn, &mut dest_conn).map_err(|e| DbError {
        code: "SNAPSHOT_BACKUP_INIT_ERROR".into(),
        message: e.to_string(),
    })?;

    backup
        .run_to_completion(100, std::time::Duration::from_millis(100), None)
        .map_err(|e| DbError {
            code: "SNAPSHOT_RUN_ERROR".into(),
            message: e.to_string(),
        })?;

    Ok(())
}

pub fn current_timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        conn
    }

    #[test]
    fn test_db_execute_batch_success() {
        let mut conn = in_memory_db();
        let setup = vec![
            StatementInput {
                sql: "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT NOT NULL)".into(),
                params: vec![],
            },
            StatementInput {
                sql: "INSERT INTO test (id, name) VALUES (?, ?)".into(),
                params: vec![serde_json::json!(1), serde_json::json!("Alice")],
            },
            StatementInput {
                sql: "INSERT INTO test (id, name) VALUES (?, ?)".into(),
                params: vec![serde_json::json!(2), serde_json::json!("Bob")],
            },
        ];

        let res = execute_batch(&mut conn, &setup);
        assert!(res.is_ok());

        let rows = execute_query(&conn, "SELECT id, name FROM test ORDER BY id", &[]).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0][1], serde_json::json!("Alice"));
        assert_eq!(rows[1][1], serde_json::json!("Bob"));
    }

    #[test]
    fn test_db_execute_batch_rollback_on_error() {
        let mut conn = in_memory_db();
        let init = vec![StatementInput {
            sql: "CREATE TABLE items (id INTEGER PRIMARY KEY, sku TEXT UNIQUE NOT NULL)".into(),
            params: vec![],
        }];
        execute_batch(&mut conn, &init).unwrap();

        // Batch that inserts item 1, then duplicate item 1 -> must roll back item 1!
        let failing_batch = vec![
            StatementInput {
                sql: "INSERT INTO items (id, sku) VALUES (?, ?)".into(),
                params: vec![serde_json::json!(1), serde_json::json!("SKU-100")],
            },
            StatementInput {
                sql: "INSERT INTO items (id, sku) VALUES (?, ?)".into(),
                params: vec![serde_json::json!(2), serde_json::json!("SKU-100")], // UNIQUE violation!
            },
        ];

        let err = execute_batch(&mut conn, &failing_batch);
        assert!(err.is_err());

        // Zero rows must exist
        let rows = execute_query(&conn, "SELECT count(*) FROM items", &[]).unwrap();
        assert_eq!(rows[0][0], serde_json::json!(0));
    }

    #[test]
    fn test_db_query_rejects_non_select() {
        let conn = in_memory_db();
        let err = execute_query(&conn, "DELETE FROM sqlite_master", &[]);
        assert!(err.is_err());
        assert_eq!(err.unwrap_err().code, "READONLY_VIOLATION");
    }

    #[test]
    fn test_db_snapshot() {
        let mut conn = in_memory_db();
        execute_batch(
            &mut conn,
            &[
                StatementInput {
                    sql: "CREATE TABLE snapshot_test (val TEXT)".into(),
                    params: vec![],
                },
                StatementInput {
                    sql: "INSERT INTO snapshot_test VALUES (?)".into(),
                    params: vec![serde_json::json!("persisted")],
                },
            ],
        )
        .unwrap();

        let temp_dir = std::env::temp_dir().join(format!("test_snapshot_{}", current_timestamp_ms()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let dest_file = temp_dir.join("backup.sqlite");

        snapshot_database(&conn, &dest_file).unwrap();
        assert!(dest_file.exists());

        let verify_conn = Connection::open(&dest_file).unwrap();
        let rows = execute_query(&verify_conn, "SELECT val FROM snapshot_test", &[]).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0][0], serde_json::json!("persisted"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
