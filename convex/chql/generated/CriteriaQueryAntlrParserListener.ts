// Generated from docs/antlr4/CriteriaQueryAntlrParser.g4 by ANTLR 4.13.1

import { ErrorNode, ParseTreeListener, ParserRuleContext, TerminalNode } from "antlr4ng";


import { ParseContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_notContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_orContext } from "./CriteriaQueryAntlrParser.js";
import { Wrapped_criteria_aliasContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_any_value_matchesContext } from "./CriteriaQueryAntlrParser.js";
import { Simple_criteria_aliasContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_andContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_all_values_matchesContext } from "./CriteriaQueryAntlrParser.js";
import { Simple_criteriaContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_allContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_kkey_with_valueContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_kkey_with_value_inContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_kkey_is_nullContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_has_no_alarmContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_has_alarmContext } from "./CriteriaQueryAntlrParser.js";
import { Criterion_monitoring_has_markContext } from "./CriteriaQueryAntlrParser.js";
import { Comparison_operatorContext } from "./CriteriaQueryAntlrParser.js";
import { Kkey_valueContext } from "./CriteriaQueryAntlrParser.js";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `CriteriaQueryAntlrParser`.
 */
export class CriteriaQueryAntlrParserListener implements ParseTreeListener {
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.parse`.
     * @param ctx the parse tree
     */
    enterParse?: (ctx: ParseContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.parse`.
     * @param ctx the parse tree
     */
    exitParse?: (ctx: ParseContext) => void;
    /**
     * Enter a parse tree produced by the `criterion_not`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    enterCriterion_not?: (ctx: Criterion_notContext) => void;
    /**
     * Exit a parse tree produced by the `criterion_not`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    exitCriterion_not?: (ctx: Criterion_notContext) => void;
    /**
     * Enter a parse tree produced by the `criterion_or`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    enterCriterion_or?: (ctx: Criterion_orContext) => void;
    /**
     * Exit a parse tree produced by the `criterion_or`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    exitCriterion_or?: (ctx: Criterion_orContext) => void;
    /**
     * Enter a parse tree produced by the `wrapped_criteria_alias`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    enterWrapped_criteria_alias?: (ctx: Wrapped_criteria_aliasContext) => void;
    /**
     * Exit a parse tree produced by the `wrapped_criteria_alias`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    exitWrapped_criteria_alias?: (ctx: Wrapped_criteria_aliasContext) => void;
    /**
     * Enter a parse tree produced by the `criterion_any_value_matches`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    enterCriterion_any_value_matches?: (ctx: Criterion_any_value_matchesContext) => void;
    /**
     * Exit a parse tree produced by the `criterion_any_value_matches`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    exitCriterion_any_value_matches?: (ctx: Criterion_any_value_matchesContext) => void;
    /**
     * Enter a parse tree produced by the `simple_criteria_alias`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    enterSimple_criteria_alias?: (ctx: Simple_criteria_aliasContext) => void;
    /**
     * Exit a parse tree produced by the `simple_criteria_alias`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    exitSimple_criteria_alias?: (ctx: Simple_criteria_aliasContext) => void;
    /**
     * Enter a parse tree produced by the `criterion_and`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    enterCriterion_and?: (ctx: Criterion_andContext) => void;
    /**
     * Exit a parse tree produced by the `criterion_and`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    exitCriterion_and?: (ctx: Criterion_andContext) => void;
    /**
     * Enter a parse tree produced by the `criterion_all_values_matches`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    enterCriterion_all_values_matches?: (ctx: Criterion_all_values_matchesContext) => void;
    /**
     * Exit a parse tree produced by the `criterion_all_values_matches`
     * labeled alternative in `CriteriaQueryAntlrParser.criteria`.
     * @param ctx the parse tree
     */
    exitCriterion_all_values_matches?: (ctx: Criterion_all_values_matchesContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.simple_criteria`.
     * @param ctx the parse tree
     */
    enterSimple_criteria?: (ctx: Simple_criteriaContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.simple_criteria`.
     * @param ctx the parse tree
     */
    exitSimple_criteria?: (ctx: Simple_criteriaContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.criterion_all`.
     * @param ctx the parse tree
     */
    enterCriterion_all?: (ctx: Criterion_allContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.criterion_all`.
     * @param ctx the parse tree
     */
    exitCriterion_all?: (ctx: Criterion_allContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.criterion_kkey_with_value`.
     * @param ctx the parse tree
     */
    enterCriterion_kkey_with_value?: (ctx: Criterion_kkey_with_valueContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.criterion_kkey_with_value`.
     * @param ctx the parse tree
     */
    exitCriterion_kkey_with_value?: (ctx: Criterion_kkey_with_valueContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.criterion_kkey_with_value_in`.
     * @param ctx the parse tree
     */
    enterCriterion_kkey_with_value_in?: (ctx: Criterion_kkey_with_value_inContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.criterion_kkey_with_value_in`.
     * @param ctx the parse tree
     */
    exitCriterion_kkey_with_value_in?: (ctx: Criterion_kkey_with_value_inContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.criterion_kkey_is_null`.
     * @param ctx the parse tree
     */
    enterCriterion_kkey_is_null?: (ctx: Criterion_kkey_is_nullContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.criterion_kkey_is_null`.
     * @param ctx the parse tree
     */
    exitCriterion_kkey_is_null?: (ctx: Criterion_kkey_is_nullContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.criterion_has_no_alarm`.
     * @param ctx the parse tree
     */
    enterCriterion_has_no_alarm?: (ctx: Criterion_has_no_alarmContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.criterion_has_no_alarm`.
     * @param ctx the parse tree
     */
    exitCriterion_has_no_alarm?: (ctx: Criterion_has_no_alarmContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.criterion_has_alarm`.
     * @param ctx the parse tree
     */
    enterCriterion_has_alarm?: (ctx: Criterion_has_alarmContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.criterion_has_alarm`.
     * @param ctx the parse tree
     */
    exitCriterion_has_alarm?: (ctx: Criterion_has_alarmContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.criterion_monitoring_has_mark`.
     * @param ctx the parse tree
     */
    enterCriterion_monitoring_has_mark?: (ctx: Criterion_monitoring_has_markContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.criterion_monitoring_has_mark`.
     * @param ctx the parse tree
     */
    exitCriterion_monitoring_has_mark?: (ctx: Criterion_monitoring_has_markContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.comparison_operator`.
     * @param ctx the parse tree
     */
    enterComparison_operator?: (ctx: Comparison_operatorContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.comparison_operator`.
     * @param ctx the parse tree
     */
    exitComparison_operator?: (ctx: Comparison_operatorContext) => void;
    /**
     * Enter a parse tree produced by `CriteriaQueryAntlrParser.kkey_value`.
     * @param ctx the parse tree
     */
    enterKkey_value?: (ctx: Kkey_valueContext) => void;
    /**
     * Exit a parse tree produced by `CriteriaQueryAntlrParser.kkey_value`.
     * @param ctx the parse tree
     */
    exitKkey_value?: (ctx: Kkey_valueContext) => void;

    visitTerminal(node: TerminalNode): void {}
    visitErrorNode(node: ErrorNode): void {}
    enterEveryRule(node: ParserRuleContext): void {}
    exitEveryRule(node: ParserRuleContext): void {}
}

