use crate::tests::common::setup_db;
use crate::{create_rule_db, get_rules_db};

#[test]
fn test_create_and_get_rules() {
    let (_dir, db_path) = setup_db();

    // Create a rule
    let id = create_rule_db(
        &db_path,
        10,
        "payee".to_string(),
        "Starbucks".to_string(),
        "category".to_string(),
        "Coffee".to_string(),
        "and".to_string(),
        vec![],
        vec![],
    )
    .expect("failed to create rule");

    assert!(id > 0);

    // Verify fetching
    let rules = get_rules_db(&db_path).expect("failed to get rules");
    assert_eq!(rules.len(), 1);

    let rule = &rules[0];
    assert_eq!(rule.id, id);
    assert_eq!(rule.priority, 10);
    assert_eq!(rule.match_field, "payee");
    assert_eq!(rule.match_pattern, "Starbucks");
    assert_eq!(rule.action_field, "category");
    assert_eq!(rule.action_value, "Coffee");
}

#[test]
fn test_create_complex_rule() {
    let (_dir, db_path) = setup_db();

    use crate::models::{RuleAction, RuleCondition};

    let conditions = vec![
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
    ];

    let actions = vec![
        RuleAction {
            field: "category".to_string(),
            value: "Coffee".to_string(),
        },
        RuleAction {
            field: "notes".to_string(),
            value: "Automatic Coffee Rule".to_string(),
        },
    ];

    let id = create_rule_db(
        &db_path,
        20,
        "".to_string(), // Legacy fields can be empty
        "".to_string(),
        "".to_string(),
        "".to_string(),
        "and".to_string(),
        conditions,
        actions,
    )
    .expect("failed to create complex rule");

    let rules = get_rules_db(&db_path).expect("failed to get rules");
    assert_eq!(rules.len(), 1);

    let rule = &rules[0];
    assert_eq!(rule.id, id);
    assert_eq!(rule.logic, "and");
    assert_eq!(rule.conditions.len(), 2);
    assert_eq!(rule.conditions[0].field, "payee");
    assert_eq!(rule.conditions[0].operator, "contains");
    assert_eq!(rule.conditions[1].field, "amount");
    assert_eq!(rule.conditions[1].operator, "less_than");
    assert_eq!(rule.actions.len(), 2);
    assert_eq!(rule.actions[0].field, "category");
    assert_eq!(rule.actions[0].value, "Coffee");
}
