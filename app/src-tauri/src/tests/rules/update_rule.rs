use crate::tests::common::setup_db;
use crate::{create_rule_db, get_rules_db, update_rule_db};

#[test]
fn test_update_rule() {
    let (_dir, db_path) = setup_db();

    let id = create_rule_db(
        &db_path,
        crate::core::rules::CreateRuleDbParams {
            priority: 10,
            match_field: "payee".to_string(),
            match_pattern: "Starbucks".to_string(),
            action_field: "category".to_string(),
            action_value: "Coffee".to_string(),
            logic: "and".to_string(),
            conditions: vec![],
            actions: vec![],
        },
    )
    .unwrap();

    update_rule_db(
        &db_path,
        crate::core::rules::UpdateRuleDbParams {
            id,
            priority: 20,
            match_field: "notes".to_string(),
            match_pattern: "My Note".to_string(),
            action_field: "amount".to_string(),
            action_value: "50.00".to_string(),
            logic: "and".to_string(),
            conditions: vec![],
            actions: vec![],
        },
    )
    .expect("failed to update rule");

    let rules = get_rules_db(&db_path).unwrap();
    let rule = &rules[0];

    assert_eq!(rule.priority, 20);
    assert_eq!(rule.match_field, "notes");
    assert_eq!(rule.match_pattern, "My Note");
    assert_eq!(rule.action_field, "amount");
    assert_eq!(rule.action_value, "50.00");
}
