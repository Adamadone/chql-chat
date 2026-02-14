lexer grammar CriteriaQueryAntlrLexer;

options { caseInsensitive=true; }

KKEY_IDENTIFIER: 'K' 'X'? [0-9]+;

NUMBER: '-'? [0-9]+ ('.' [0-9]+)?;
STRING: '\'' ~'\''* '\'';

EQ:          '=';
LT:          '<';
LT_EQ:       '<=';
GT:          '>';
GT_EQ:       '>=';
REGEX_MATCH: '=~';

ALARM:       'ALARM';
ALL:         'ALL';
AND:         'AND';
ANY:         'ANY';
HAS:         'HAS';
IN:          'IN';
IS:          'IS';
LIKE:        'LIKE';
MARK:        'MARK';
MATCHES:     'MATCHES';
NO:          'NO';
NOT:         'NOT';
NULL:        'NULL';
OR:          'OR';
VALUE:       'VALUE';
VALUES:      'VALUES';

OPEN_PARENTHESIS:  '(';
CLOSE_PARENTHESIS: ')';
COMMA: ',';

SPACES: [ \u000B\t\r\n] -> channel(HIDDEN);
