// Generated from docs/antlr4/CriteriaQueryAntlrLexer.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";


export class CriteriaQueryAntlrLexer extends antlr.Lexer {
    public static readonly KKEY_IDENTIFIER = 1;
    public static readonly NUMBER = 2;
    public static readonly STRING = 3;
    public static readonly EQ = 4;
    public static readonly LT = 5;
    public static readonly LT_EQ = 6;
    public static readonly GT = 7;
    public static readonly GT_EQ = 8;
    public static readonly REGEX_MATCH = 9;
    public static readonly ALARM = 10;
    public static readonly ALL = 11;
    public static readonly AND = 12;
    public static readonly ANY = 13;
    public static readonly HAS = 14;
    public static readonly IN = 15;
    public static readonly IS = 16;
    public static readonly LIKE = 17;
    public static readonly MARK = 18;
    public static readonly MATCHES = 19;
    public static readonly NO = 20;
    public static readonly NOT = 21;
    public static readonly NULL = 22;
    public static readonly OR = 23;
    public static readonly VALUE = 24;
    public static readonly VALUES = 25;
    public static readonly OPEN_PARENTHESIS = 26;
    public static readonly CLOSE_PARENTHESIS = 27;
    public static readonly COMMA = 28;
    public static readonly SPACES = 29;

    public static readonly channelNames = [
        "DEFAULT_TOKEN_CHANNEL", "HIDDEN"
    ];

    public static readonly literalNames = [
        null, null, null, null, "'='", "'<'", "'<='", "'>'", "'>='", "'=~'", 
        "'ALARM'", "'ALL'", "'AND'", "'ANY'", "'HAS'", "'IN'", "'IS'", "'LIKE'", 
        "'MARK'", "'MATCHES'", "'NO'", "'NOT'", "'NULL'", "'OR'", "'VALUE'", 
        "'VALUES'", "'('", "')'", "','"
    ];

    public static readonly symbolicNames = [
        null, "KKEY_IDENTIFIER", "NUMBER", "STRING", "EQ", "LT", "LT_EQ", 
        "GT", "GT_EQ", "REGEX_MATCH", "ALARM", "ALL", "AND", "ANY", "HAS", 
        "IN", "IS", "LIKE", "MARK", "MATCHES", "NO", "NOT", "NULL", "OR", 
        "VALUE", "VALUES", "OPEN_PARENTHESIS", "CLOSE_PARENTHESIS", "COMMA", 
        "SPACES"
    ];

    public static readonly modeNames = [
        "DEFAULT_MODE",
    ];

    public static readonly ruleNames = [
        "KKEY_IDENTIFIER", "NUMBER", "STRING", "EQ", "LT", "LT_EQ", "GT", 
        "GT_EQ", "REGEX_MATCH", "ALARM", "ALL", "AND", "ANY", "HAS", "IN", 
        "IS", "LIKE", "MARK", "MATCHES", "NO", "NOT", "NULL", "OR", "VALUE", 
        "VALUES", "OPEN_PARENTHESIS", "CLOSE_PARENTHESIS", "COMMA", "SPACES",
    ];


    public constructor(input: antlr.CharStream) {
        super(input);
        this.interpreter = new antlr.LexerATNSimulator(this, CriteriaQueryAntlrLexer._ATN, CriteriaQueryAntlrLexer.decisionsToDFA, new antlr.PredictionContextCache());
    }

    public get grammarFileName(): string { return "CriteriaQueryAntlrLexer.g4"; }

    public get literalNames(): (string | null)[] { return CriteriaQueryAntlrLexer.literalNames; }
    public get symbolicNames(): (string | null)[] { return CriteriaQueryAntlrLexer.symbolicNames; }
    public get ruleNames(): string[] { return CriteriaQueryAntlrLexer.ruleNames; }

    public get serializedATN(): number[] { return CriteriaQueryAntlrLexer._serializedATN; }

    public get channelNames(): string[] { return CriteriaQueryAntlrLexer.channelNames; }

    public get modeNames(): string[] { return CriteriaQueryAntlrLexer.modeNames; }

    public static readonly _serializedATN: number[] = [
        4,0,29,192,6,-1,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,
        2,6,7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,
        13,7,13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,
        19,2,20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,
        26,7,26,2,27,7,27,2,28,7,28,1,0,1,0,3,0,62,8,0,1,0,4,0,65,8,0,11,
        0,12,0,66,1,1,3,1,70,8,1,1,1,4,1,73,8,1,11,1,12,1,74,1,1,1,1,4,1,
        79,8,1,11,1,12,1,80,3,1,83,8,1,1,2,1,2,5,2,87,8,2,10,2,12,2,90,9,
        2,1,2,1,2,1,3,1,3,1,4,1,4,1,5,1,5,1,5,1,6,1,6,1,7,1,7,1,7,1,8,1,
        8,1,8,1,9,1,9,1,9,1,9,1,9,1,9,1,10,1,10,1,10,1,10,1,11,1,11,1,11,
        1,11,1,12,1,12,1,12,1,12,1,13,1,13,1,13,1,13,1,14,1,14,1,14,1,15,
        1,15,1,15,1,16,1,16,1,16,1,16,1,16,1,17,1,17,1,17,1,17,1,17,1,18,
        1,18,1,18,1,18,1,18,1,18,1,18,1,18,1,19,1,19,1,19,1,20,1,20,1,20,
        1,20,1,21,1,21,1,21,1,21,1,21,1,22,1,22,1,22,1,23,1,23,1,23,1,23,
        1,23,1,23,1,24,1,24,1,24,1,24,1,24,1,24,1,24,1,25,1,25,1,26,1,26,
        1,27,1,27,1,28,1,28,1,28,1,28,0,0,29,1,1,3,2,5,3,7,4,9,5,11,6,13,
        7,15,8,17,9,19,10,21,11,23,12,25,13,27,14,29,15,31,16,33,17,35,18,
        37,19,39,20,41,21,43,22,45,23,47,24,49,25,51,26,53,27,55,28,57,29,
        1,0,21,2,0,75,75,107,107,2,0,88,88,120,120,1,0,48,57,1,0,39,39,2,
        0,65,65,97,97,2,0,76,76,108,108,2,0,82,82,114,114,2,0,77,77,109,
        109,2,0,78,78,110,110,2,0,68,68,100,100,2,0,89,89,121,121,2,0,72,
        72,104,104,2,0,83,83,115,115,2,0,73,73,105,105,2,0,69,69,101,101,
        2,0,84,84,116,116,2,0,67,67,99,99,2,0,79,79,111,111,2,0,85,85,117,
        117,2,0,86,86,118,118,3,0,9,11,13,13,32,32,198,0,1,1,0,0,0,0,3,1,
        0,0,0,0,5,1,0,0,0,0,7,1,0,0,0,0,9,1,0,0,0,0,11,1,0,0,0,0,13,1,0,
        0,0,0,15,1,0,0,0,0,17,1,0,0,0,0,19,1,0,0,0,0,21,1,0,0,0,0,23,1,0,
        0,0,0,25,1,0,0,0,0,27,1,0,0,0,0,29,1,0,0,0,0,31,1,0,0,0,0,33,1,0,
        0,0,0,35,1,0,0,0,0,37,1,0,0,0,0,39,1,0,0,0,0,41,1,0,0,0,0,43,1,0,
        0,0,0,45,1,0,0,0,0,47,1,0,0,0,0,49,1,0,0,0,0,51,1,0,0,0,0,53,1,0,
        0,0,0,55,1,0,0,0,0,57,1,0,0,0,1,59,1,0,0,0,3,69,1,0,0,0,5,84,1,0,
        0,0,7,93,1,0,0,0,9,95,1,0,0,0,11,97,1,0,0,0,13,100,1,0,0,0,15,102,
        1,0,0,0,17,105,1,0,0,0,19,108,1,0,0,0,21,114,1,0,0,0,23,118,1,0,
        0,0,25,122,1,0,0,0,27,126,1,0,0,0,29,130,1,0,0,0,31,133,1,0,0,0,
        33,136,1,0,0,0,35,141,1,0,0,0,37,146,1,0,0,0,39,154,1,0,0,0,41,157,
        1,0,0,0,43,161,1,0,0,0,45,166,1,0,0,0,47,169,1,0,0,0,49,175,1,0,
        0,0,51,182,1,0,0,0,53,184,1,0,0,0,55,186,1,0,0,0,57,188,1,0,0,0,
        59,61,7,0,0,0,60,62,7,1,0,0,61,60,1,0,0,0,61,62,1,0,0,0,62,64,1,
        0,0,0,63,65,7,2,0,0,64,63,1,0,0,0,65,66,1,0,0,0,66,64,1,0,0,0,66,
        67,1,0,0,0,67,2,1,0,0,0,68,70,5,45,0,0,69,68,1,0,0,0,69,70,1,0,0,
        0,70,72,1,0,0,0,71,73,7,2,0,0,72,71,1,0,0,0,73,74,1,0,0,0,74,72,
        1,0,0,0,74,75,1,0,0,0,75,82,1,0,0,0,76,78,5,46,0,0,77,79,7,2,0,0,
        78,77,1,0,0,0,79,80,1,0,0,0,80,78,1,0,0,0,80,81,1,0,0,0,81,83,1,
        0,0,0,82,76,1,0,0,0,82,83,1,0,0,0,83,4,1,0,0,0,84,88,5,39,0,0,85,
        87,8,3,0,0,86,85,1,0,0,0,87,90,1,0,0,0,88,86,1,0,0,0,88,89,1,0,0,
        0,89,91,1,0,0,0,90,88,1,0,0,0,91,92,5,39,0,0,92,6,1,0,0,0,93,94,
        5,61,0,0,94,8,1,0,0,0,95,96,5,60,0,0,96,10,1,0,0,0,97,98,5,60,0,
        0,98,99,5,61,0,0,99,12,1,0,0,0,100,101,5,62,0,0,101,14,1,0,0,0,102,
        103,5,62,0,0,103,104,5,61,0,0,104,16,1,0,0,0,105,106,5,61,0,0,106,
        107,5,126,0,0,107,18,1,0,0,0,108,109,7,4,0,0,109,110,7,5,0,0,110,
        111,7,4,0,0,111,112,7,6,0,0,112,113,7,7,0,0,113,20,1,0,0,0,114,115,
        7,4,0,0,115,116,7,5,0,0,116,117,7,5,0,0,117,22,1,0,0,0,118,119,7,
        4,0,0,119,120,7,8,0,0,120,121,7,9,0,0,121,24,1,0,0,0,122,123,7,4,
        0,0,123,124,7,8,0,0,124,125,7,10,0,0,125,26,1,0,0,0,126,127,7,11,
        0,0,127,128,7,4,0,0,128,129,7,12,0,0,129,28,1,0,0,0,130,131,7,13,
        0,0,131,132,7,8,0,0,132,30,1,0,0,0,133,134,7,13,0,0,134,135,7,12,
        0,0,135,32,1,0,0,0,136,137,7,5,0,0,137,138,7,13,0,0,138,139,7,0,
        0,0,139,140,7,14,0,0,140,34,1,0,0,0,141,142,7,7,0,0,142,143,7,4,
        0,0,143,144,7,6,0,0,144,145,7,0,0,0,145,36,1,0,0,0,146,147,7,7,0,
        0,147,148,7,4,0,0,148,149,7,15,0,0,149,150,7,16,0,0,150,151,7,11,
        0,0,151,152,7,14,0,0,152,153,7,12,0,0,153,38,1,0,0,0,154,155,7,8,
        0,0,155,156,7,17,0,0,156,40,1,0,0,0,157,158,7,8,0,0,158,159,7,17,
        0,0,159,160,7,15,0,0,160,42,1,0,0,0,161,162,7,8,0,0,162,163,7,18,
        0,0,163,164,7,5,0,0,164,165,7,5,0,0,165,44,1,0,0,0,166,167,7,17,
        0,0,167,168,7,6,0,0,168,46,1,0,0,0,169,170,7,19,0,0,170,171,7,4,
        0,0,171,172,7,5,0,0,172,173,7,18,0,0,173,174,7,14,0,0,174,48,1,0,
        0,0,175,176,7,19,0,0,176,177,7,4,0,0,177,178,7,5,0,0,178,179,7,18,
        0,0,179,180,7,14,0,0,180,181,7,12,0,0,181,50,1,0,0,0,182,183,5,40,
        0,0,183,52,1,0,0,0,184,185,5,41,0,0,185,54,1,0,0,0,186,187,5,44,
        0,0,187,56,1,0,0,0,188,189,7,20,0,0,189,190,1,0,0,0,190,191,6,28,
        0,0,191,58,1,0,0,0,8,0,61,66,69,74,80,82,88,1,0,1,0
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!CriteriaQueryAntlrLexer.__ATN) {
            CriteriaQueryAntlrLexer.__ATN = new antlr.ATNDeserializer().deserialize(CriteriaQueryAntlrLexer._serializedATN);
        }

        return CriteriaQueryAntlrLexer.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(CriteriaQueryAntlrLexer.literalNames, CriteriaQueryAntlrLexer.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return CriteriaQueryAntlrLexer.vocabulary;
    }

    private static readonly decisionsToDFA = CriteriaQueryAntlrLexer._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}