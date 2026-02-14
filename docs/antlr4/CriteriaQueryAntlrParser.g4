parser grammar CriteriaQueryAntlrParser;

options {
    tokenVocab=CriteriaQueryAntlrLexer;
}

parse: (criteria)* EOF;

criteria:
    simple_criteria # simple_criteria_alias
    | OPEN_PARENTHESIS criteria CLOSE_PARENTHESIS # wrapped_criteria_alias
    | ANY VALUE MATCHES OPEN_PARENTHESIS criteria CLOSE_PARENTHESIS #criterion_any_value_matches
    | ALL VALUES MATCHES OPEN_PARENTHESIS criteria CLOSE_PARENTHESIS #criterion_all_values_matches
    | NOT criteria #criterion_not
    | criteria AND criteria (AND criteria)* # criterion_and
    | criteria OR criteria (OR criteria)* #criterion_or
;

simple_criteria:
    criterion_all |
    criterion_kkey_with_value |
    criterion_kkey_with_value_in |
    criterion_kkey_is_null |
    criterion_has_no_alarm |
    criterion_has_alarm |
    criterion_monitoring_has_mark;

criterion_all: ALL;

criterion_kkey_with_value: KKEY_IDENTIFIER comparison_operator kkey_value;
criterion_kkey_with_value_in: KKEY_IDENTIFIER IN OPEN_PARENTHESIS kkey_value (COMMA kkey_value)* CLOSE_PARENTHESIS;
criterion_kkey_is_null: KKEY_IDENTIFIER IS NULL;

criterion_has_no_alarm: HAS NO ALARM;
criterion_has_alarm: HAS ALARM STRING;

criterion_monitoring_has_mark: HAS MARK NUMBER;

comparison_operator: EQ | LT | LT_EQ | GT | GT_EQ | LIKE | REGEX_MATCH;

kkey_value: NUMBER | STRING;