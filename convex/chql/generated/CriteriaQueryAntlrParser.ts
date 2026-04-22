// Generated from docs/antlr4/CriteriaQueryAntlrParser.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { CriteriaQueryAntlrParserListener } from "./CriteriaQueryAntlrParserListener.js";
// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class CriteriaQueryAntlrParser extends antlr.Parser {
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
    public static readonly RULE_parse = 0;
    public static readonly RULE_criteria = 1;
    public static readonly RULE_simple_criteria = 2;
    public static readonly RULE_criterion_all = 3;
    public static readonly RULE_criterion_kkey_with_value = 4;
    public static readonly RULE_criterion_kkey_with_value_in = 5;
    public static readonly RULE_criterion_kkey_is_null = 6;
    public static readonly RULE_criterion_has_no_alarm = 7;
    public static readonly RULE_criterion_has_alarm = 8;
    public static readonly RULE_criterion_monitoring_has_mark = 9;
    public static readonly RULE_comparison_operator = 10;
    public static readonly RULE_kkey_value = 11;

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
    public static readonly ruleNames = [
        "parse", "criteria", "simple_criteria", "criterion_all", "criterion_kkey_with_value", 
        "criterion_kkey_with_value_in", "criterion_kkey_is_null", "criterion_has_no_alarm", 
        "criterion_has_alarm", "criterion_monitoring_has_mark", "comparison_operator", 
        "kkey_value",
    ];

    public get grammarFileName(): string { return "CriteriaQueryAntlrParser.g4"; }
    public get literalNames(): (string | null)[] { return CriteriaQueryAntlrParser.literalNames; }
    public get symbolicNames(): (string | null)[] { return CriteriaQueryAntlrParser.symbolicNames; }
    public get ruleNames(): string[] { return CriteriaQueryAntlrParser.ruleNames; }
    public get serializedATN(): number[] { return CriteriaQueryAntlrParser._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, CriteriaQueryAntlrParser._ATN, CriteriaQueryAntlrParser.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public parse(): ParseContext {
        let localContext = new ParseContext(this.context, this.state);
        this.enterRule(localContext, 0, CriteriaQueryAntlrParser.RULE_parse);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 27;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 69232642) !== 0)) {
                {
                {
                this.state = 24;
                this.criteria(0);
                }
                }
                this.state = 29;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 30;
            this.match(CriteriaQueryAntlrParser.EOF);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public criteria(): CriteriaContext;
    public criteria(_p: number): CriteriaContext;
    public criteria(_p?: number): CriteriaContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new CriteriaContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 2;
        this.enterRecursionRule(localContext, 2, CriteriaQueryAntlrParser.RULE_criteria, _p);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 54;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 1, this.context) ) {
            case 1:
                {
                localContext = new Simple_criteria_aliasContext(localContext);
                this.context = localContext;
                previousContext = localContext;

                this.state = 33;
                this.simple_criteria();
                }
                break;
            case 2:
                {
                localContext = new Wrapped_criteria_aliasContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 34;
                this.match(CriteriaQueryAntlrParser.OPEN_PARENTHESIS);
                this.state = 35;
                this.criteria(0);
                this.state = 36;
                this.match(CriteriaQueryAntlrParser.CLOSE_PARENTHESIS);
                }
                break;
            case 3:
                {
                localContext = new Criterion_any_value_matchesContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 38;
                this.match(CriteriaQueryAntlrParser.ANY);
                this.state = 39;
                this.match(CriteriaQueryAntlrParser.VALUE);
                this.state = 40;
                this.match(CriteriaQueryAntlrParser.MATCHES);
                this.state = 41;
                this.match(CriteriaQueryAntlrParser.OPEN_PARENTHESIS);
                this.state = 42;
                this.criteria(0);
                this.state = 43;
                this.match(CriteriaQueryAntlrParser.CLOSE_PARENTHESIS);
                }
                break;
            case 4:
                {
                localContext = new Criterion_all_values_matchesContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 45;
                this.match(CriteriaQueryAntlrParser.ALL);
                this.state = 46;
                this.match(CriteriaQueryAntlrParser.VALUES);
                this.state = 47;
                this.match(CriteriaQueryAntlrParser.MATCHES);
                this.state = 48;
                this.match(CriteriaQueryAntlrParser.OPEN_PARENTHESIS);
                this.state = 49;
                this.criteria(0);
                this.state = 50;
                this.match(CriteriaQueryAntlrParser.CLOSE_PARENTHESIS);
                }
                break;
            case 5:
                {
                localContext = new Criterion_notContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 52;
                this.match(CriteriaQueryAntlrParser.NOT);
                this.state = 53;
                this.criteria(3);
                }
                break;
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 78;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 5, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 76;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 4, this.context) ) {
                    case 1:
                        {
                        localContext = new Criterion_andContext(new CriteriaContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, CriteriaQueryAntlrParser.RULE_criteria);
                        this.state = 56;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 57;
                        this.match(CriteriaQueryAntlrParser.AND);
                        this.state = 58;
                        this.criteria(0);
                        this.state = 63;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 2, this.context);
                        while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                            if (alternative === 1) {
                                {
                                {
                                this.state = 59;
                                this.match(CriteriaQueryAntlrParser.AND);
                                this.state = 60;
                                this.criteria(0);
                                }
                                }
                            }
                            this.state = 65;
                            this.errorHandler.sync(this);
                            alternative = this.interpreter.adaptivePredict(this.tokenStream, 2, this.context);
                        }
                        }
                        break;
                    case 2:
                        {
                        localContext = new Criterion_orContext(new CriteriaContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, CriteriaQueryAntlrParser.RULE_criteria);
                        this.state = 66;
                        if (!(this.precpred(this.context, 1))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 1)");
                        }
                        this.state = 67;
                        this.match(CriteriaQueryAntlrParser.OR);
                        this.state = 68;
                        this.criteria(0);
                        this.state = 73;
                        this.errorHandler.sync(this);
                        alternative = this.interpreter.adaptivePredict(this.tokenStream, 3, this.context);
                        while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                            if (alternative === 1) {
                                {
                                {
                                this.state = 69;
                                this.match(CriteriaQueryAntlrParser.OR);
                                this.state = 70;
                                this.criteria(0);
                                }
                                }
                            }
                            this.state = 75;
                            this.errorHandler.sync(this);
                            alternative = this.interpreter.adaptivePredict(this.tokenStream, 3, this.context);
                        }
                        }
                        break;
                    }
                    }
                }
                this.state = 80;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 5, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }
    public simple_criteria(): Simple_criteriaContext {
        let localContext = new Simple_criteriaContext(this.context, this.state);
        this.enterRule(localContext, 4, CriteriaQueryAntlrParser.RULE_simple_criteria);
        try {
            this.state = 88;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 6, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 81;
                this.criterion_all();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 82;
                this.criterion_kkey_with_value();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 83;
                this.criterion_kkey_with_value_in();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 84;
                this.criterion_kkey_is_null();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 85;
                this.criterion_has_no_alarm();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 86;
                this.criterion_has_alarm();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 87;
                this.criterion_monitoring_has_mark();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public criterion_all(): Criterion_allContext {
        let localContext = new Criterion_allContext(this.context, this.state);
        this.enterRule(localContext, 6, CriteriaQueryAntlrParser.RULE_criterion_all);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 90;
            this.match(CriteriaQueryAntlrParser.ALL);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public criterion_kkey_with_value(): Criterion_kkey_with_valueContext {
        let localContext = new Criterion_kkey_with_valueContext(this.context, this.state);
        this.enterRule(localContext, 8, CriteriaQueryAntlrParser.RULE_criterion_kkey_with_value);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 92;
            this.match(CriteriaQueryAntlrParser.KKEY_IDENTIFIER);
            this.state = 93;
            this.comparison_operator();
            this.state = 94;
            this.kkey_value();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public criterion_kkey_with_value_in(): Criterion_kkey_with_value_inContext {
        let localContext = new Criterion_kkey_with_value_inContext(this.context, this.state);
        this.enterRule(localContext, 10, CriteriaQueryAntlrParser.RULE_criterion_kkey_with_value_in);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 96;
            this.match(CriteriaQueryAntlrParser.KKEY_IDENTIFIER);
            this.state = 97;
            this.match(CriteriaQueryAntlrParser.IN);
            this.state = 98;
            this.match(CriteriaQueryAntlrParser.OPEN_PARENTHESIS);
            this.state = 99;
            this.kkey_value();
            this.state = 104;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 28) {
                {
                {
                this.state = 100;
                this.match(CriteriaQueryAntlrParser.COMMA);
                this.state = 101;
                this.kkey_value();
                }
                }
                this.state = 106;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 107;
            this.match(CriteriaQueryAntlrParser.CLOSE_PARENTHESIS);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public criterion_kkey_is_null(): Criterion_kkey_is_nullContext {
        let localContext = new Criterion_kkey_is_nullContext(this.context, this.state);
        this.enterRule(localContext, 12, CriteriaQueryAntlrParser.RULE_criterion_kkey_is_null);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 109;
            this.match(CriteriaQueryAntlrParser.KKEY_IDENTIFIER);
            this.state = 110;
            this.match(CriteriaQueryAntlrParser.IS);
            this.state = 111;
            this.match(CriteriaQueryAntlrParser.NULL);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public criterion_has_no_alarm(): Criterion_has_no_alarmContext {
        let localContext = new Criterion_has_no_alarmContext(this.context, this.state);
        this.enterRule(localContext, 14, CriteriaQueryAntlrParser.RULE_criterion_has_no_alarm);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 113;
            this.match(CriteriaQueryAntlrParser.HAS);
            this.state = 114;
            this.match(CriteriaQueryAntlrParser.NO);
            this.state = 115;
            this.match(CriteriaQueryAntlrParser.ALARM);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public criterion_has_alarm(): Criterion_has_alarmContext {
        let localContext = new Criterion_has_alarmContext(this.context, this.state);
        this.enterRule(localContext, 16, CriteriaQueryAntlrParser.RULE_criterion_has_alarm);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 117;
            this.match(CriteriaQueryAntlrParser.HAS);
            this.state = 118;
            this.match(CriteriaQueryAntlrParser.ALARM);
            this.state = 119;
            this.match(CriteriaQueryAntlrParser.STRING);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public criterion_monitoring_has_mark(): Criterion_monitoring_has_markContext {
        let localContext = new Criterion_monitoring_has_markContext(this.context, this.state);
        this.enterRule(localContext, 18, CriteriaQueryAntlrParser.RULE_criterion_monitoring_has_mark);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 121;
            this.match(CriteriaQueryAntlrParser.HAS);
            this.state = 122;
            this.match(CriteriaQueryAntlrParser.MARK);
            this.state = 123;
            this.match(CriteriaQueryAntlrParser.NUMBER);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public comparison_operator(): Comparison_operatorContext {
        let localContext = new Comparison_operatorContext(this.context, this.state);
        this.enterRule(localContext, 20, CriteriaQueryAntlrParser.RULE_comparison_operator);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 125;
            _la = this.tokenStream.LA(1);
            if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 132080) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public kkey_value(): Kkey_valueContext {
        let localContext = new Kkey_valueContext(this.context, this.state);
        this.enterRule(localContext, 22, CriteriaQueryAntlrParser.RULE_kkey_value);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 127;
            _la = this.tokenStream.LA(1);
            if(!(_la === 2 || _la === 3)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public override sempred(localContext: antlr.ParserRuleContext | null, ruleIndex: number, predIndex: number): boolean {
        switch (ruleIndex) {
        case 1:
            return this.criteria_sempred(localContext as CriteriaContext, predIndex);
        }
        return true;
    }
    private criteria_sempred(localContext: CriteriaContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 0:
            return this.precpred(this.context, 2);
        case 1:
            return this.precpred(this.context, 1);
        }
        return true;
    }

    public static readonly _serializedATN: number[] = [
        4,1,29,130,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,
        6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,1,0,5,0,26,8,0,10,
        0,12,0,29,9,0,1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,55,8,1,1,1,1,1,
        1,1,1,1,1,1,5,1,62,8,1,10,1,12,1,65,9,1,1,1,1,1,1,1,1,1,1,1,5,1,
        72,8,1,10,1,12,1,75,9,1,5,1,77,8,1,10,1,12,1,80,9,1,1,2,1,2,1,2,
        1,2,1,2,1,2,1,2,3,2,89,8,2,1,3,1,3,1,4,1,4,1,4,1,4,1,5,1,5,1,5,1,
        5,1,5,1,5,5,5,103,8,5,10,5,12,5,106,9,5,1,5,1,5,1,6,1,6,1,6,1,6,
        1,7,1,7,1,7,1,7,1,8,1,8,1,8,1,8,1,9,1,9,1,9,1,9,1,10,1,10,1,11,1,
        11,1,11,0,1,2,12,0,2,4,6,8,10,12,14,16,18,20,22,0,2,2,0,4,9,17,17,
        1,0,2,3,133,0,27,1,0,0,0,2,54,1,0,0,0,4,88,1,0,0,0,6,90,1,0,0,0,
        8,92,1,0,0,0,10,96,1,0,0,0,12,109,1,0,0,0,14,113,1,0,0,0,16,117,
        1,0,0,0,18,121,1,0,0,0,20,125,1,0,0,0,22,127,1,0,0,0,24,26,3,2,1,
        0,25,24,1,0,0,0,26,29,1,0,0,0,27,25,1,0,0,0,27,28,1,0,0,0,28,30,
        1,0,0,0,29,27,1,0,0,0,30,31,5,0,0,1,31,1,1,0,0,0,32,33,6,1,-1,0,
        33,55,3,4,2,0,34,35,5,26,0,0,35,36,3,2,1,0,36,37,5,27,0,0,37,55,
        1,0,0,0,38,39,5,13,0,0,39,40,5,24,0,0,40,41,5,19,0,0,41,42,5,26,
        0,0,42,43,3,2,1,0,43,44,5,27,0,0,44,55,1,0,0,0,45,46,5,11,0,0,46,
        47,5,25,0,0,47,48,5,19,0,0,48,49,5,26,0,0,49,50,3,2,1,0,50,51,5,
        27,0,0,51,55,1,0,0,0,52,53,5,21,0,0,53,55,3,2,1,3,54,32,1,0,0,0,
        54,34,1,0,0,0,54,38,1,0,0,0,54,45,1,0,0,0,54,52,1,0,0,0,55,78,1,
        0,0,0,56,57,10,2,0,0,57,58,5,12,0,0,58,63,3,2,1,0,59,60,5,12,0,0,
        60,62,3,2,1,0,61,59,1,0,0,0,62,65,1,0,0,0,63,61,1,0,0,0,63,64,1,
        0,0,0,64,77,1,0,0,0,65,63,1,0,0,0,66,67,10,1,0,0,67,68,5,23,0,0,
        68,73,3,2,1,0,69,70,5,23,0,0,70,72,3,2,1,0,71,69,1,0,0,0,72,75,1,
        0,0,0,73,71,1,0,0,0,73,74,1,0,0,0,74,77,1,0,0,0,75,73,1,0,0,0,76,
        56,1,0,0,0,76,66,1,0,0,0,77,80,1,0,0,0,78,76,1,0,0,0,78,79,1,0,0,
        0,79,3,1,0,0,0,80,78,1,0,0,0,81,89,3,6,3,0,82,89,3,8,4,0,83,89,3,
        10,5,0,84,89,3,12,6,0,85,89,3,14,7,0,86,89,3,16,8,0,87,89,3,18,9,
        0,88,81,1,0,0,0,88,82,1,0,0,0,88,83,1,0,0,0,88,84,1,0,0,0,88,85,
        1,0,0,0,88,86,1,0,0,0,88,87,1,0,0,0,89,5,1,0,0,0,90,91,5,11,0,0,
        91,7,1,0,0,0,92,93,5,1,0,0,93,94,3,20,10,0,94,95,3,22,11,0,95,9,
        1,0,0,0,96,97,5,1,0,0,97,98,5,15,0,0,98,99,5,26,0,0,99,104,3,22,
        11,0,100,101,5,28,0,0,101,103,3,22,11,0,102,100,1,0,0,0,103,106,
        1,0,0,0,104,102,1,0,0,0,104,105,1,0,0,0,105,107,1,0,0,0,106,104,
        1,0,0,0,107,108,5,27,0,0,108,11,1,0,0,0,109,110,5,1,0,0,110,111,
        5,16,0,0,111,112,5,22,0,0,112,13,1,0,0,0,113,114,5,14,0,0,114,115,
        5,20,0,0,115,116,5,10,0,0,116,15,1,0,0,0,117,118,5,14,0,0,118,119,
        5,10,0,0,119,120,5,3,0,0,120,17,1,0,0,0,121,122,5,14,0,0,122,123,
        5,18,0,0,123,124,5,2,0,0,124,19,1,0,0,0,125,126,7,0,0,0,126,21,1,
        0,0,0,127,128,7,1,0,0,128,23,1,0,0,0,8,27,54,63,73,76,78,88,104
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!CriteriaQueryAntlrParser.__ATN) {
            CriteriaQueryAntlrParser.__ATN = new antlr.ATNDeserializer().deserialize(CriteriaQueryAntlrParser._serializedATN);
        }

        return CriteriaQueryAntlrParser.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(CriteriaQueryAntlrParser.literalNames, CriteriaQueryAntlrParser.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return CriteriaQueryAntlrParser.vocabulary;
    }

    private static readonly decisionsToDFA = CriteriaQueryAntlrParser._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class ParseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public EOF(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.EOF, 0)!;
    }
    public criteria(): CriteriaContext[];
    public criteria(i: number): CriteriaContext | null;
    public criteria(i?: number): CriteriaContext[] | CriteriaContext | null {
        if (i === undefined) {
            return this.getRuleContexts(CriteriaContext);
        }

        return this.getRuleContext(i, CriteriaContext);
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_parse;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterParse) {
             listener.enterParse(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitParse) {
             listener.exitParse(this);
        }
    }
}


export class CriteriaContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_criteria;
    }
    public override copyFrom(ctx: CriteriaContext): void {
        super.copyFrom(ctx);
    }
}
export class Criterion_notContext extends CriteriaContext {
    public constructor(ctx: CriteriaContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public NOT(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.NOT, 0)!;
    }
    public criteria(): CriteriaContext {
        return this.getRuleContext(0, CriteriaContext)!;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_not) {
             listener.enterCriterion_not(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_not) {
             listener.exitCriterion_not(this);
        }
    }
}
export class Criterion_orContext extends CriteriaContext {
    public constructor(ctx: CriteriaContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public criteria(): CriteriaContext[];
    public criteria(i: number): CriteriaContext | null;
    public criteria(i?: number): CriteriaContext[] | CriteriaContext | null {
        if (i === undefined) {
            return this.getRuleContexts(CriteriaContext);
        }

        return this.getRuleContext(i, CriteriaContext);
    }
    public OR(): antlr.TerminalNode[];
    public OR(i: number): antlr.TerminalNode | null;
    public OR(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CriteriaQueryAntlrParser.OR);
    	} else {
    		return this.getToken(CriteriaQueryAntlrParser.OR, i);
    	}
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_or) {
             listener.enterCriterion_or(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_or) {
             listener.exitCriterion_or(this);
        }
    }
}
export class Wrapped_criteria_aliasContext extends CriteriaContext {
    public constructor(ctx: CriteriaContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public OPEN_PARENTHESIS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.OPEN_PARENTHESIS, 0)!;
    }
    public criteria(): CriteriaContext {
        return this.getRuleContext(0, CriteriaContext)!;
    }
    public CLOSE_PARENTHESIS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.CLOSE_PARENTHESIS, 0)!;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterWrapped_criteria_alias) {
             listener.enterWrapped_criteria_alias(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitWrapped_criteria_alias) {
             listener.exitWrapped_criteria_alias(this);
        }
    }
}
export class Criterion_any_value_matchesContext extends CriteriaContext {
    public constructor(ctx: CriteriaContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public ANY(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.ANY, 0)!;
    }
    public VALUE(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.VALUE, 0)!;
    }
    public MATCHES(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.MATCHES, 0)!;
    }
    public OPEN_PARENTHESIS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.OPEN_PARENTHESIS, 0)!;
    }
    public criteria(): CriteriaContext {
        return this.getRuleContext(0, CriteriaContext)!;
    }
    public CLOSE_PARENTHESIS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.CLOSE_PARENTHESIS, 0)!;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_any_value_matches) {
             listener.enterCriterion_any_value_matches(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_any_value_matches) {
             listener.exitCriterion_any_value_matches(this);
        }
    }
}
export class Simple_criteria_aliasContext extends CriteriaContext {
    public constructor(ctx: CriteriaContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public simple_criteria(): Simple_criteriaContext {
        return this.getRuleContext(0, Simple_criteriaContext)!;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterSimple_criteria_alias) {
             listener.enterSimple_criteria_alias(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitSimple_criteria_alias) {
             listener.exitSimple_criteria_alias(this);
        }
    }
}
export class Criterion_andContext extends CriteriaContext {
    public constructor(ctx: CriteriaContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public criteria(): CriteriaContext[];
    public criteria(i: number): CriteriaContext | null;
    public criteria(i?: number): CriteriaContext[] | CriteriaContext | null {
        if (i === undefined) {
            return this.getRuleContexts(CriteriaContext);
        }

        return this.getRuleContext(i, CriteriaContext);
    }
    public AND(): antlr.TerminalNode[];
    public AND(i: number): antlr.TerminalNode | null;
    public AND(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CriteriaQueryAntlrParser.AND);
    	} else {
    		return this.getToken(CriteriaQueryAntlrParser.AND, i);
    	}
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_and) {
             listener.enterCriterion_and(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_and) {
             listener.exitCriterion_and(this);
        }
    }
}
export class Criterion_all_values_matchesContext extends CriteriaContext {
    public constructor(ctx: CriteriaContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public ALL(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.ALL, 0)!;
    }
    public VALUES(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.VALUES, 0)!;
    }
    public MATCHES(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.MATCHES, 0)!;
    }
    public OPEN_PARENTHESIS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.OPEN_PARENTHESIS, 0)!;
    }
    public criteria(): CriteriaContext {
        return this.getRuleContext(0, CriteriaContext)!;
    }
    public CLOSE_PARENTHESIS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.CLOSE_PARENTHESIS, 0)!;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_all_values_matches) {
             listener.enterCriterion_all_values_matches(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_all_values_matches) {
             listener.exitCriterion_all_values_matches(this);
        }
    }
}


export class Simple_criteriaContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public criterion_all(): Criterion_allContext | null {
        return this.getRuleContext(0, Criterion_allContext);
    }
    public criterion_kkey_with_value(): Criterion_kkey_with_valueContext | null {
        return this.getRuleContext(0, Criterion_kkey_with_valueContext);
    }
    public criterion_kkey_with_value_in(): Criterion_kkey_with_value_inContext | null {
        return this.getRuleContext(0, Criterion_kkey_with_value_inContext);
    }
    public criterion_kkey_is_null(): Criterion_kkey_is_nullContext | null {
        return this.getRuleContext(0, Criterion_kkey_is_nullContext);
    }
    public criterion_has_no_alarm(): Criterion_has_no_alarmContext | null {
        return this.getRuleContext(0, Criterion_has_no_alarmContext);
    }
    public criterion_has_alarm(): Criterion_has_alarmContext | null {
        return this.getRuleContext(0, Criterion_has_alarmContext);
    }
    public criterion_monitoring_has_mark(): Criterion_monitoring_has_markContext | null {
        return this.getRuleContext(0, Criterion_monitoring_has_markContext);
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_simple_criteria;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterSimple_criteria) {
             listener.enterSimple_criteria(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitSimple_criteria) {
             listener.exitSimple_criteria(this);
        }
    }
}


export class Criterion_allContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ALL(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.ALL, 0)!;
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_criterion_all;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_all) {
             listener.enterCriterion_all(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_all) {
             listener.exitCriterion_all(this);
        }
    }
}


export class Criterion_kkey_with_valueContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public KKEY_IDENTIFIER(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.KKEY_IDENTIFIER, 0)!;
    }
    public comparison_operator(): Comparison_operatorContext {
        return this.getRuleContext(0, Comparison_operatorContext)!;
    }
    public kkey_value(): Kkey_valueContext {
        return this.getRuleContext(0, Kkey_valueContext)!;
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_criterion_kkey_with_value;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_kkey_with_value) {
             listener.enterCriterion_kkey_with_value(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_kkey_with_value) {
             listener.exitCriterion_kkey_with_value(this);
        }
    }
}


export class Criterion_kkey_with_value_inContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public KKEY_IDENTIFIER(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.KKEY_IDENTIFIER, 0)!;
    }
    public IN(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.IN, 0)!;
    }
    public OPEN_PARENTHESIS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.OPEN_PARENTHESIS, 0)!;
    }
    public kkey_value(): Kkey_valueContext[];
    public kkey_value(i: number): Kkey_valueContext | null;
    public kkey_value(i?: number): Kkey_valueContext[] | Kkey_valueContext | null {
        if (i === undefined) {
            return this.getRuleContexts(Kkey_valueContext);
        }

        return this.getRuleContext(i, Kkey_valueContext);
    }
    public CLOSE_PARENTHESIS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.CLOSE_PARENTHESIS, 0)!;
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CriteriaQueryAntlrParser.COMMA);
    	} else {
    		return this.getToken(CriteriaQueryAntlrParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_criterion_kkey_with_value_in;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_kkey_with_value_in) {
             listener.enterCriterion_kkey_with_value_in(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_kkey_with_value_in) {
             listener.exitCriterion_kkey_with_value_in(this);
        }
    }
}


export class Criterion_kkey_is_nullContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public KKEY_IDENTIFIER(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.KKEY_IDENTIFIER, 0)!;
    }
    public IS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.IS, 0)!;
    }
    public NULL(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.NULL, 0)!;
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_criterion_kkey_is_null;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_kkey_is_null) {
             listener.enterCriterion_kkey_is_null(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_kkey_is_null) {
             listener.exitCriterion_kkey_is_null(this);
        }
    }
}


export class Criterion_has_no_alarmContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public HAS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.HAS, 0)!;
    }
    public NO(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.NO, 0)!;
    }
    public ALARM(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.ALARM, 0)!;
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_criterion_has_no_alarm;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_has_no_alarm) {
             listener.enterCriterion_has_no_alarm(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_has_no_alarm) {
             listener.exitCriterion_has_no_alarm(this);
        }
    }
}


export class Criterion_has_alarmContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public HAS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.HAS, 0)!;
    }
    public ALARM(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.ALARM, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.STRING, 0)!;
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_criterion_has_alarm;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_has_alarm) {
             listener.enterCriterion_has_alarm(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_has_alarm) {
             listener.exitCriterion_has_alarm(this);
        }
    }
}


export class Criterion_monitoring_has_markContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public HAS(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.HAS, 0)!;
    }
    public MARK(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.MARK, 0)!;
    }
    public NUMBER(): antlr.TerminalNode {
        return this.getToken(CriteriaQueryAntlrParser.NUMBER, 0)!;
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_criterion_monitoring_has_mark;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterCriterion_monitoring_has_mark) {
             listener.enterCriterion_monitoring_has_mark(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitCriterion_monitoring_has_mark) {
             listener.exitCriterion_monitoring_has_mark(this);
        }
    }
}


export class Comparison_operatorContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public EQ(): antlr.TerminalNode | null {
        return this.getToken(CriteriaQueryAntlrParser.EQ, 0);
    }
    public LT(): antlr.TerminalNode | null {
        return this.getToken(CriteriaQueryAntlrParser.LT, 0);
    }
    public LT_EQ(): antlr.TerminalNode | null {
        return this.getToken(CriteriaQueryAntlrParser.LT_EQ, 0);
    }
    public GT(): antlr.TerminalNode | null {
        return this.getToken(CriteriaQueryAntlrParser.GT, 0);
    }
    public GT_EQ(): antlr.TerminalNode | null {
        return this.getToken(CriteriaQueryAntlrParser.GT_EQ, 0);
    }
    public LIKE(): antlr.TerminalNode | null {
        return this.getToken(CriteriaQueryAntlrParser.LIKE, 0);
    }
    public REGEX_MATCH(): antlr.TerminalNode | null {
        return this.getToken(CriteriaQueryAntlrParser.REGEX_MATCH, 0);
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_comparison_operator;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterComparison_operator) {
             listener.enterComparison_operator(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitComparison_operator) {
             listener.exitComparison_operator(this);
        }
    }
}


export class Kkey_valueContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public NUMBER(): antlr.TerminalNode | null {
        return this.getToken(CriteriaQueryAntlrParser.NUMBER, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(CriteriaQueryAntlrParser.STRING, 0);
    }
    public override get ruleIndex(): number {
        return CriteriaQueryAntlrParser.RULE_kkey_value;
    }
    public override enterRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.enterKkey_value) {
             listener.enterKkey_value(this);
        }
    }
    public override exitRule(listener: CriteriaQueryAntlrParserListener): void {
        if(listener.exitKkey_value) {
             listener.exitKkey_value(this);
        }
    }
}
