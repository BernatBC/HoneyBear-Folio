use crate::models::Rule;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use tauri::AppHandle;

pub fn get_rules_db(db_path: &PathBuf) -> Result<Vec<Rule>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, priority, match_field, match_pattern, action_field, action_value FROM rules ORDER BY priority DESC, id ASC")
        .map_err(|e| e.to_string())?;

    let rule_iter = stmt
        .query_map([], |row| {
            Ok(Rule {
                id: row.get(0)?,
                priority: row.get(1)?,
                match_field: row.get(2)?,
                match_pattern: row.get(3)?,
                action_field: row.get(4)?,
                action_value: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut rules = Vec::new();
    for rule in rule_iter {
        rules.push(rule.map_err(|e| e.to_string())?);
    }
    Ok(rules)
}

pub fn create_rule_db(
    db_path: &PathBuf,
    priority: i32,
    match_field: String,
    match_pattern: String,
    action_field: String,
    action_value: String,
) -> Result<i32, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO rules (priority, match_field, match_pattern, action_field, action_value) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![priority, match_field, match_pattern, action_field, action_value],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid() as i32;
    Ok(id)
}

pub fn update_rule_db(
    db_path: &PathBuf,
    id: i32,
    priority: i32,
    match_field: String,
    match_pattern: String,
    action_field: String,
    action_value: String,
) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE rules SET priority = ?1, match_field = ?2, match_pattern = ?3, action_field = ?4, action_value = ?5 WHERE id = ?6",
        params![priority, match_field, match_pattern, action_field, action_value, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn delete_rule_db(db_path: &PathBuf, id: i32) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM rules WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn update_rules_order_db(db_path: &PathBuf, rule_ids: Vec<i32>) -> Result<(), String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let total = rule_ids.len() as i32;
    for (idx, id) in rule_ids.iter().enumerate() {
        // Priority: Top of list (index 0) gets highest priority value
        let priority = total - (idx as i32);
        tx.execute(
            "UPDATE rules SET priority = ?1 WHERE id = ?2",
            params![priority, id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_rules(app_handle: AppHandle) -> Result<Vec<Rule>, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    get_rules_db(&db_path)
}

#[tauri::command]
pub fn create_rule(
    app_handle: AppHandle,
    priority: i32,
    match_field: String,
    match_pattern: String,
    action_field: String,
    action_value: String,
) -> Result<i32, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    create_rule_db(
        &db_path,
        priority,
        match_field,
        match_pattern,
        action_field,
        action_value,
    )
}

#[tauri::command]
pub fn update_rule(
    app_handle: AppHandle,
    id: i32,
    priority: i32,
    match_field: String,
    match_pattern: String,
    action_field: String,
    action_value: String,
) -> Result<(), String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    update_rule_db(
        &db_path,
        id,
        priority,
        match_field,
        match_pattern,
        action_field,
        action_value,
    )
}

#[tauri::command]
pub fn delete_rule(app_handle: AppHandle, id: i32) -> Result<(), String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    delete_rule_db(&db_path, id)
}

#[tauri::command]
pub fn update_rules_order(app_handle: AppHandle, rule_ids: Vec<i32>) -> Result<(), String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    update_rules_order_db(&db_path, rule_ids)
}
