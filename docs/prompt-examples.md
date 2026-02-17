# Scénáře \- Vlastovo příklady prompts

| ID | Vstup v přirozeném jazyce (NL Prompt) | Předpokládaný dotaz v DSL (Příklad transformace) | Účel/Kontext dotazu |
| ----- | ----- | ----- | ----- |
| **1** | **Najdi všechny naměřené hodnoty pro díl s ID “9647544”** | **K0014 \= '9647544'** | **Všechna měření konkrétního kusu.  U tohoto by jsi měl dostat odpovědi z API.** |
| **2** | **Najdi všechny měření znaku “bottle\_diameter” za poslední hodinu.** | **K2002 \= 'bottle\_diameter' AND K0004 \>= '2026-05-02T12:36:05+02:00' AND K0004 \< '2026-05-02T13:36:05+02:00'** | **Hodnoty znaku za poslední hodinu U tohoto by jsi měl dostat odpovědi z API.** |
| **3** | **Najdi měření dílu “bottle\_0\_7” ze strojů “crowning\_1” a “crowning\_2”.** | **K1002 \= 'bottle\_0\_7' AND (K4063 \= 'crowning\_1' OR K4063 \= 'crowning\_2')** | **Porovnání 2 strojů** |
| **4** | **Dej mi měření znaku “bottle\_height”, která jsou mimo tolerance.** | **K2002 \= 'bottle\_height' AND HAS ALARM 'valueOutsideSpecificationLimits'** | **Hledání hodnot mimo tolerance** |
| **5** | **Zobraz měření z operace OP10 z aktuální směny.** | **K4062 \= 'OP10' AND K0004 \>= '2026-05-02T06:00:00+02:00' AND K0004 \< '2026-05-02T13:36:05+02:00'** | **Hodnoty konkrétní operace z aktuální směny (porozumění konceptu směny)** |
| **6** | **Najdi hodnoty parametru “water\_temperature” z výrobní dávky 66540-ALE, které jsou menší než 80,5.** | **K0053 \= '66540-ALE' AND K2002 \= 'water\_temperature' AND K0001 \< 80.5** | **Hodnota je menší než 80.5 \- práce s čísly** |

