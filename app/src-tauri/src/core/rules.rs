use crate::models::{Rule, RuleAction, RuleCondition, Transaction};
use rusqlite::{params, Connection};
use std::path::PathBuf;
use tauri::AppHandle;

/// Evaluates all rules against a transaction and applies the actions of matching rules.
/// Rules are applied in reverse order of the slice (assuming input is priority DESC, 
/// we apply lowest priority first so highest priority wins).
pub fn apply_rules_to_transaction(transaction: &mut Transaction, rules: &[Rule]) {
    for rule in rules.iter().rev() {
        if matches_rule(transaction, rule) {
            apply_rule_actions(transaction, rule);
        }
    }
}

fn matches_rule(transaction: &Transaction, rule: &Rule) -> bool {
    let (logic, conditions) = if !rule.conditions.is_empty() {
        (rule.logic.as_str(), &rule.conditions)
    } else {
        // Fallback to legacy fields if conditions are empty
        if !rule.match_field.is_empty() && !rule.match_pattern.is_empty() {
            return matches_legacy(transaction, &rule.match_field, &rule.match_pattern);
        }
        return false;
    };

    if logic == "or" {
        conditions.iter().any(|c| matches_condition(transaction, c))
    } else {
        conditions.iter().all(|c| matches_condition(transaction, c))
    }
}

fn matches_legacy(transaction: &Transaction, field: &str, pattern: &str) -> bool {
    let val = get_transaction_field(transaction, field);
    val.to_lowercase().contains(&pattern.to_lowercase())
}

fn get_transaction_field(transaction: &Transaction, field: &str) -> String {
    match field {
        "payee" => transaction.payee.clone(),
        "notes" => transaction.notes.clone().unwrap_or_default(),
        "category" => transaction.category.clone().unwrap_or_default(),
        "amount" => transaction.amount.to_string(),
        "date" => transaction.date.clone(),
        "ticker" => transaction.ticker.clone().unwrap_or_default(),
        _ => String::new(),
    }
}

fn matches_condition(transaction: &Transaction, condition: &RuleCondition) -> bool {
    let val = get_transaction_field(transaction, &condition.field);
    let pattern = &condition.value;

    let matched = match condition.operator.as_str() {
        "equals" => val.to_lowercase() == pattern.to_lowercase(),
        "contains" => val.to_lowercase().contains(&pattern.to_lowercase()),
        "starts_with" => val.to_lowercase().starts_with(&pattern.to_lowercase()),
        "ends_with" => val.to_lowercase().ends_with(&pattern.to_lowercase()),
        "greater_than" => {
            let v = val.parse::<f64>().unwrap_or(0.0);
            let p = pattern.parse::<f64>().unwrap_or(0.0);
            v > p
        }
        "less_than" => {
            let v = val.parse::<f64>().unwrap_or(0.0);
            let p = pattern.parse::<f64>().unwrap_or(0.0);
            v < p
        }
        _ => false,
    };

    if condition.negated {
        !matched
    } else {
        matched
    }
}

fn apply_rule_actions(transaction: &mut Transaction, rule: &Rule) {
    if !rule.actions.is_empty() {
        for action in &rule.actions {
            apply_action(transaction, action);
        }
    } else if !rule.action_field.is_empty() && !rule.action_value.is_empty() {
        // Fallback to legacy action fields
        apply_action_legacy(transaction, &rule.action_field, &rule.action_value);
    }
}

fn apply_action(transaction: &mut Transaction, action: &RuleAction) {
    match action.field.as_str() {
        "category" => transaction.category = Some(action.value.to_string()),
        "notes" => transaction.notes = Some(action.value.to_string()),
        "payee" => transaction.payee = action.value.to_string(),
        _ => {}
    }
}

fn apply_action_legacy(transaction: &mut Transaction, field: &str, value: &str) {
    match field {
        "category" => transaction.category = Some(value.to_string()),
        "notes" => transaction.notes = Some(value.to_string()),
        "payee" => transaction.payee = value.to_string(),
        _ => {}
    }
}

pub fn get_rules_db(db_path: &PathBuf) -> Result<Vec<Rule>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, priority, match_field, match_pattern, action_field, action_value, COALESCE(logic, 'and'), COALESCE(conditions, '[]'), COALESCE(actions, '[]') FROM rules ORDER BY priority DESC, id ASC")
        .map_err(|e| e.to_string())?;

    let rule_iter = stmt
        .query_map([], |row| {
            let conditions_json: String = row.get(7)?;
            let actions_json: String = row.get(8)?;

            let conditions: Vec<RuleCondition> =
                serde_json::from_str(&conditions_json).unwrap_or_default();
            let actions: Vec<RuleAction> = serde_json::from_str(&actions_json).unwrap_or_default();

            Ok(Rule {
                id: row.get(0)?,
                priority: row.get(1)?,
                match_field: row.get(2)?,
                match_pattern: row.get(3)?,
                action_field: row.get(4)?,
                action_value: row.get(5)?,
                logic: row.get(6)?,
                conditions,
                actions,
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
    logic: String,
    conditions: Vec<RuleCondition>,
    actions: Vec<RuleAction>,
) -> Result<i32, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let conditions_json = serde_json::to_string(&conditions).map_err(|e| e.to_string())?;
    let actions_json = serde_json::to_string(&actions).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO rules (priority, match_field, match_pattern, action_field, action_value, logic, conditions, actions) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![priority, match_field, match_pattern, action_field, action_value, logic, conditions_json, actions_json],
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
    logic: String,
    conditions: Vec<RuleCondition>,
    actions: Vec<RuleAction>,
) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let conditions_json = serde_json::to_string(&conditions).map_err(|e| e.to_string())?;
    let actions_json = serde_json::to_string(&actions).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE rules SET priority = ?1, match_field = ?2, match_pattern = ?3, action_field = ?4, action_value = ?5, logic = ?6, conditions = ?7, actions = ?8 WHERE id = ?9",
        params![priority, match_field, match_pattern, action_field, action_value, logic, conditions_json, actions_json, id],
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
    logic: Option<String>,
    conditions: Option<Vec<RuleCondition>>,
    actions: Option<Vec<RuleAction>>,
) -> Result<i32, String> {
    let db_path = crate::db_init::get_db_path(&app_handle)?;
    create_rule_db(
        &db_path,
        priority,
        match_field,
        match_pattern,
        action_field,
        action_value,
        logic.unwrap_or_else(|| "and".to_string()),
        conditions.unwrap_or_default(),
        actions.unwrap_or_default(),
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
    logic: Option<String>,
    conditions: Option<Vec<RuleCondition>>,
    actions: Option<Vec<RuleAction>>,
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
        logic.unwrap_or_else(|| "and".to_string()),
        conditions.unwrap_or_default(),
        actions.unwrap_or_default(),
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
