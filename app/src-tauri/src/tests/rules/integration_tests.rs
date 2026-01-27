use crate::models::{RuleAction, RuleCondition};
use crate::tests::common::setup_db;
use crate::{create_rule_db, create_transaction_db, CreateTransactionArgs};

#[test]
fn test_rule_application_during_transaction_creation() {
    let (_dir, db_path) = setup_db();

    // 1. Setup an account
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute(
        "INSERT INTO accounts (name, balance, currency) VALUES ('Test Account', 1000.0, 'USD')",
        [],
    )
    .unwrap();
    let account_id: i32 = conn
        .query_row(
            "SELECT id FROM accounts WHERE name = 'Test Account'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    // 2. Create a rule
    let conditions = vec![RuleCondition {
        field: "payee".to_string(),
        operator: "contains".to_string(),
        value: "Starbucks".to_string(),
        negated: false,
    }];
    let actions = vec![
        RuleAction {
            field: "category".to_string(),
            value: "Coffee & Drinks".to_string(),
        },
        RuleAction {
            field: "notes".to_string(),
            value: "Applied via rule".to_string(),
        },
    ];
    create_rule_db(
        &db_path,
        crate::core::rules::CreateRuleDbParams {
            priority: 10,
            match_field: "".to_string(),
            match_pattern: "".to_string(),
            action_field: "".to_string(),
            action_value: "".to_string(),
            logic: "and".to_string(),
            conditions,
            actions,
        },
    )
    .unwrap();

    // 3. Create a transaction that matches the rule
    let args = CreateTransactionArgs {
        account_id,
        date: "2023-01-01".to_string(),
        payee: "Starbucks London".to_string(),
        notes: None,
        category: None,
        amount: -5.0,
        ticker: None,
        shares: None,
        price_per_share: None,
        fee: None,
        currency: None,
    };

    let tx = create_transaction_db(&db_path, args).expect("failed to create transaction");

    // 4. Verify rule was applied
    assert_eq!(tx.category, Some("Coffee & Drinks".to_string()));
    assert_eq!(tx.notes, Some("Applied via rule".to_string()));
}

#[test]
fn test_rule_precedence_in_db() {
    let (_dir, db_path) = setup_db();

    // 1. Setup account
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute(
        "INSERT INTO accounts (name, balance, currency) VALUES ('Test Account', 1000.0, 'USD')",
        [],
    )
    .unwrap();
    let account_id: i32 = conn
        .query_row(
            "SELECT id FROM accounts WHERE name = 'Test Account'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    // 2. Create two rules, one with higher priority
    // Rule 1: Lower priority (10)
    create_rule_db(
        &db_path,
        crate::core::rules::CreateRuleDbParams {
            priority: 10,
            match_field: "".to_string(),
            match_pattern: "".to_string(),
            action_field: "".to_string(),
            action_value: "".to_string(),
            logic: "and".to_string(),
            conditions: vec![RuleCondition {
                field: "payee".to_string(),
                operator: "contains".to_string(),
                value: "Shop".to_string(),
                negated: false,
            }],
            actions: vec![RuleAction {
                field: "category".to_string(),
                value: "Shopping".to_string(),
            }],
        },
    )
    .unwrap();

    // Rule 2: Higher priority (20)
    create_rule_db(
        &db_path,
        crate::core::rules::CreateRuleDbParams {
            priority: 20,
            match_field: "".to_string(),
            match_pattern: "".to_string(),
            action_field: "".to_string(),
            action_value: "".to_string(),
            logic: "and".to_string(),
            conditions: vec![RuleCondition {
                field: "payee".to_string(),
                operator: "contains".to_string(),
                value: "Shop".to_string(),
                negated: false,
            }],
            actions: vec![RuleAction {
                field: "category".to_string(),
                value: "Supermarket".to_string(),
            }],
        },
    )
    .unwrap();

    // 3. Create transaction
    let args = CreateTransactionArgs {
        account_id,
        date: "2023-01-01".to_string(),
        payee: "Cool Shop".to_string(),
        notes: None,
        category: None,
        amount: -20.0,
        ticker: None,
        shares: None,
        price_per_share: None,
        fee: None,
        currency: None,
    };

    let tx = create_transaction_db(&db_path, args).unwrap();

    // Higher priority should win
    assert_eq!(tx.category, Some("Supermarket".to_string()));
}
