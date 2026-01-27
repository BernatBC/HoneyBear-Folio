use crate::tests::common::setup_db;
use crate::{create_rule_db, delete_rule_db, get_rules_db};

#[test]
fn test_delete_rule() {
    let (_dir, db_path) = setup_db();

    let id = create_rule_db(
        &db_path,
        crate::core::rules::CreateRuleDbParams {
            priority: 10,
            match_field: "payee".to_string(),
            match_pattern: "Delete Me".to_string(),
            action_field: "category".to_string(),
            action_value: "N/A".to_string(),
            logic: "and".to_string(),
            conditions: vec![],
            actions: vec![],
        },
    )
    .unwrap();

    let rules_before = get_rules_db(&db_path).unwrap();
    assert_eq!(rules_before.len(), 1);

    delete_rule_db(&db_path, id).expect("failed to delete rule");

    let rules_after = get_rules_db(&db_path).unwrap();
    assert_eq!(rules_after.len(), 0);
}
