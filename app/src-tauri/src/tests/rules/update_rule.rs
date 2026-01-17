use crate::tests::common::setup_db;
use crate::{create_rule_db, get_rules_db, update_rule_db};

#[test]
fn test_update_rule() {
    let (_dir, db_path) = setup_db();

    let id = create_rule_db(
        &db_path,
        10,
        "payee".to_string(),
        "Starbucks".to_string(),
        "category".to_string(),
        "Coffee".to_string(),
    )
    .unwrap();

    update_rule_db(
        &db_path,
        id,
        20,
        "notes".to_string(),
        "My Note".to_string(),
        "amount".to_string(),
        "50.00".to_string(),
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
