pub mod db;

use db::{ActiveConnection, CompanyInfo, DbError, DbState, StatementInput};
use tauri::Manager;

#[tauri::command]
pub fn db_query(
    state: tauri::State<'_, DbState>,
    sql: String,
    params: Option<Vec<serde_json::Value>>,
) -> Result<Vec<Vec<serde_json::Value>>, DbError> {
    let guard = state.active_conn.lock().unwrap();
    let active = guard.as_ref().ok_or_else(|| DbError {
        code: "NO_ACTIVE_DATABASE".into(),
        message: "No company database is currently open. Open or create a company first.".into(),
    })?;

    db::execute_query(&active.conn, &sql, &params.unwrap_or_default())
}

#[tauri::command]
pub fn db_execute_batch(
    state: tauri::State<'_, DbState>,
    statements: Vec<StatementInput>,
) -> Result<usize, DbError> {
    let mut guard = state.active_conn.lock().unwrap();
    let active = guard.as_mut().ok_or_else(|| DbError {
        code: "NO_ACTIVE_DATABASE".into(),
        message: "No company database is currently open. Open or create a company first.".into(),
    })?;

    db::execute_batch(&mut active.conn, &statements)
}

#[tauri::command]
pub fn db_snapshot(state: tauri::State<'_, DbState>, dest: String) -> Result<(), DbError> {
    let guard = state.active_conn.lock().unwrap();
    let active = guard.as_ref().ok_or_else(|| DbError {
        code: "NO_ACTIVE_DATABASE".into(),
        message: "No company database is currently open. Open or create a company first.".into(),
    })?;

    let dest_path = if std::path::Path::new(&dest).is_absolute() {
        std::path::PathBuf::from(&dest)
    } else {
        state.app_data_dir.join(&dest)
    };

    db::snapshot_database(&active.conn, &dest_path)
}

#[tauri::command]
pub fn company_create(
    state: tauri::State<'_, DbState>,
    name: String,
) -> Result<CompanyInfo, DbError> {
    let id = format!("comp_{}", db::current_timestamp_ms());
    let db_path = state.company_db_path(&id);
    let conn = DbState::open_connection_for_file(&db_path)?;

    let mut reg = state.read_registry();
    for c in &mut reg.companies {
        c.is_last_opened = false;
    }

    let company = CompanyInfo {
        id: id.clone(),
        name,
        created_at: db::current_timestamp_ms(),
        db_filename: format!("{}.sqlite", id),
        is_last_opened: true,
    };

    reg.companies.push(company.clone());
    reg.last_opened_id = Some(id.clone());
    state.write_registry(&reg)?;

    let mut guard = state.active_conn.lock().unwrap();
    *guard = Some(ActiveConnection {
        company_id: id,
        conn,
    });

    Ok(company)
}

#[tauri::command]
pub fn company_open(
    state: tauri::State<'_, DbState>,
    company_id: String,
) -> Result<CompanyInfo, DbError> {
    let mut reg = state.read_registry();
    let company_opt = reg.companies.iter_mut().find(|c| c.id == company_id);

    let company = match company_opt {
        Some(c) => {
            c.is_last_opened = true;
            c.clone()
        }
        None => {
            return Err(DbError {
                code: "COMPANY_NOT_FOUND".into(),
                message: format!("Company with ID '{}' was not found in registry.", company_id),
            });
        }
    };

    for c in &mut reg.companies {
        if c.id != company_id {
            c.is_last_opened = false;
        }
    }
    reg.last_opened_id = Some(company_id.clone());
    state.write_registry(&reg)?;

    let db_path = state.company_db_path(&company_id);
    let conn = DbState::open_connection_for_file(&db_path)?;

    let mut guard = state.active_conn.lock().unwrap();
    *guard = Some(ActiveConnection {
        company_id,
        conn,
    });

    Ok(company)
}

#[tauri::command]
pub fn company_list(state: tauri::State<'_, DbState>) -> Result<Vec<CompanyInfo>, DbError> {
    let reg = state.read_registry();
    let last_id = reg.last_opened_id.as_deref();

    let list = reg
        .companies
        .into_iter()
        .map(|mut c| {
            c.is_last_opened = last_id.map(|lid| lid == c.id).unwrap_or(false);
            c
        })
        .collect();

    Ok(list)
}

#[tauri::command]
pub fn company_get_current(
    state: tauri::State<'_, DbState>,
) -> Result<Option<CompanyInfo>, DbError> {
    let guard = state.active_conn.lock().unwrap();
    match guard.as_ref() {
        Some(active) => {
            let reg = state.read_registry();
            let info = reg
                .companies
                .into_iter()
                .find(|c| c.id == active.company_id)
                .map(|mut c| {
                    c.is_last_opened = true;
                    c
                });
            Ok(info)
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn hash_password(password: String) -> Result<String, String> {
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    use argon2::Argon2;

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| e.to_string())?
        .to_string();
    Ok(hash)
}

#[tauri::command]
pub fn verify_password(password: String, hash: String) -> Result<bool, String> {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    use argon2::Argon2;

    let parsed_hash = PasswordHash::new(&hash).map_err(|e| e.to_string())?;
    let argon2 = Argon2::default();
    Ok(argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("desktop_app"));
            app.manage(DbState::new(app_data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_query,
            db_execute_batch,
            db_snapshot,
            company_create,
            company_open,
            company_list,
            company_get_current,
            hash_password,
            verify_password,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

