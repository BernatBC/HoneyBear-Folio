use crate::models::{Rule, RuleAction, RuleCondition, Transaction};
use crate::rules::apply_rules_to_transaction;

fn create_base_transaction() -> Transaction {
    Transaction {
        id: 1,
        account_id: 1,
        date: "2023-01-01".to_string(),
        payee: "Starbucks Coffee".to_string(),
        notes: Some("Morning coffee".to_string()),
        category: None,
        amount: -5.50,
        ticker: None,
        shares: None,
        price_per_share: None,
        fee: None,
        currency: Some("USD".to_string()),
    }
}

#[test]
fn test_rule_matching_and_logic() {
    let mut tx = create_base_transaction();

    let rule = Rule {
        id: 1,
        priority: 10,
        match_field: "".to_string(),
        match_pattern: "".to_string(),
        action_field: "".to_string(),
        action_value: "".to_string(),
        logic: "and".to_string(),
        conditions: vec![
            RuleCondition {
                field: "payee".to_string(),
                operator: "contains".to_string(),
                value: "Starbucks".to_string(),
                negated: false,
            },
            RuleCondition {
                field: "amount".to_string(),
                operator: "less_than".to_string(),
                value: "0".to_string(),
                negated: false,
            },
        ],
        actions: vec![RuleAction {
            field: "category".to_string(),
            value: "Food & Drink".to_string(),
        }],
    };

    apply_rules_to_transaction(&mut tx, &[rule]);
    assert_eq!(tx.category, Some("Food & Drink".to_string()));
}

#[test]
fn test_rule_matching_or_logic() {
    let mut tx = create_base_transaction(); // payee: Starbucks Coffee, amount: -5.50

    let rule = Rule {
        id: 1,
        priority: 10,
        match_field: "".to_string(),
        match_pattern: "".to_string(),
        action_field: "".to_string(),
        action_value: "".to_string(),
        logic: "or".to_string(),
        conditions: vec![
            RuleCondition {
                field: "payee".to_string(),
                operator: "equals".to_string(),
                value: "Non-existent".to_string(),
                negated: false,
            },
            RuleCondition {
                field: "amount".to_string(),
                operator: "less_than".to_string(),
                value: "0".to_string(),
                negated: false,
            },
        ],
        actions: vec![RuleAction {
            field: "category".to_string(),
            value: "Matched".to_string(),
        }],
    };

    apply_rules_to_transaction(&mut tx, &[rule]);
    assert_eq!(tx.category, Some("Matched".to_string()));
}

#[test]
fn test_rule_negated_condition() {
    let mut tx = create_base_transaction(); // payee: Starbucks Coffee

    let rule = Rule {
        id: 1,
        priority: 10,
        match_field: "".to_string(),
        match_pattern: "".to_string(),
        action_field: "".to_string(),
        action_value: "".to_string(),
        logic: "and".to_string(),
        conditions: vec![RuleCondition {
            field: "payee".to_string(),
            operator: "contains".to_string(),
            value: "McDonalds".to_string(),
            negated: true, // NOT McDonalds
        }],
        actions: vec![RuleAction {
            field: "category".to_string(),
            value: "Not Fast Food".to_string(),
        }],
    };

    apply_rules_to_transaction(&mut tx, &[rule]);
    assert_eq!(tx.category, Some("Not Fast Food".to_string()));
}

#[test]
fn test_multiple_actions() {
    let mut tx = create_base_transaction();

    let rule = Rule {
        id: 1,
        priority: 10,
        match_field: "".to_string(),
        match_pattern: "".to_string(),
        action_field: "".to_string(),
        action_value: "".to_string(),
        logic: "and".to_string(),
        conditions: vec![RuleCondition {
            field: "payee".to_string(),
            operator: "contains".to_string(),
            value: "Starbucks".to_string(),
            negated: false,
        }],
        actions: vec![
            RuleAction {
                field: "category".to_string(),
                value: "Coffee".to_string(),
            },
            RuleAction {
                field: "notes".to_string(),
                value: "Updated Note".to_string(),
            },
            RuleAction {
                field: "payee".to_string(),
                value: "Starbucks Corp".to_string(),
            },
        ],
    };

    apply_rules_to_transaction(&mut tx, &[rule]);
    assert_eq!(tx.category, Some("Coffee".to_string()));
    assert_eq!(tx.notes, Some("Updated Note".to_string()));
    assert_eq!(tx.payee, "Starbucks Corp");
}

#[test]
fn test_legacy_fallback() {
    let mut tx = create_base_transaction();

    let rule = Rule {
        id: 1,
        priority: 10,
        match_field: "payee".to_string(),
        match_pattern: "Starbucks".to_string(),
        action_field: "category".to_string(),
        action_value: "Legacy Coffee".to_string(),
        logic: "and".to_string(),
        conditions: vec![],
        actions: vec![],
    };

    apply_rules_to_transaction(&mut tx, &[rule]);
    assert_eq!(tx.category, Some("Legacy Coffee".to_string()));
}

#[test]
fn test_priority_order() {
    let mut tx = create_base_transaction();

    let rules = vec![
        Rule {
            id: 1,
            priority: 20, // Higher priority
            match_field: "payee".to_string(),
            match_pattern: "Starbucks".to_string(),
            action_field: "category".to_string(),
            action_value: "Priority Winner".to_string(),
            logic: "and".to_string(),
            conditions: vec![],
            actions: vec![],
        },
        Rule {
            id: 2,
            priority: 10, // Lower priority
            match_field: "payee".to_string(),
            match_pattern: "Starbucks".to_string(),
            action_field: "category".to_string(),
            action_value: "Priority Loser".to_string(),
            logic: "and".to_string(),
            conditions: vec![],
            actions: vec![],
        },
    ];

    apply_rules_to_transaction(&mut tx, &rules);
    // Highest priority (20) should win over lower priority (10)
    assert_eq!(tx.category, Some("Priority Winner".to_string()));
}

#[test]
fn test_operators() {
    let mut tx = create_base_transaction(); // payee: Starbucks Coffee, amount: -5.50

    // Test greater_than (e.g. amount > -10)
    let rule_gt = Rule {
        id: 1,
        priority: 10,
        match_field: "".to_string(),
        match_pattern: "".to_string(),
        action_field: "".to_string(),
        action_value: "".to_string(),
        logic: "and".to_string(),
        conditions: vec![RuleCondition {
            field: "amount".to_string(),
            operator: "greater_than".to_string(),
            value: "-10".to_string(),
            negated: false,
        }],
        actions: vec![RuleAction {
            field: "category".to_string(),
            value: "Large enough".to_string(),
        }],
    };
    apply_rules_to_transaction(&mut tx, &[rule_gt]);
    assert_eq!(tx.category, Some("Large enough".to_string()));

    // Test starts_with
    tx.category = None;
    let rule_sw = Rule {
        id: 2,
        priority: 10,
        match_field: "".to_string(),
        match_pattern: "".to_string(),
        action_field: "".to_string(),
        action_value: "".to_string(),
        logic: "and".to_string(),
        conditions: vec![RuleCondition {
            field: "payee".to_string(),
            operator: "starts_with".to_string(),
            value: "Star".to_string(),
            negated: false,
        }],
        actions: vec![RuleAction {
            field: "category".to_string(),
            value: "Starts with Star".to_string(),
        }],
    };
    apply_rules_to_transaction(&mut tx, &[rule_sw]);
    assert_eq!(tx.category, Some("Starts with Star".to_string()));

    // Test ends_with
    tx.category = None;
    let rule_ew = Rule {
        id: 3,
        priority: 10,
        match_field: "".to_string(),
        match_pattern: "".to_string(),
        action_field: "".to_string(),
        action_value: "".to_string(),
        logic: "and".to_string(),
        conditions: vec![RuleCondition {
            field: "payee".to_string(),
            operator: "ends_with".to_string(),
            value: "Coffee".to_string(),
            negated: false,
        }],
        actions: vec![RuleAction {
            field: "category".to_string(),
            value: "Ends with Coffee".to_string(),
        }],
    };
    apply_rules_to_transaction(&mut tx, &[rule_ew]);
    assert_eq!(tx.category, Some("Ends with Coffee".to_string()));
}
