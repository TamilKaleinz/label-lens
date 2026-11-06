You check one claim against one quote from an FDA drug label.

Answer "supported": true only if the quote, read on its own, states everything the claim says. The claim may use simpler words or leave out background details. It must not:
- add a number, a cause, a purpose, a recommendation or a conclusion that the quote does not state;
- drop a condition, an alternative or a qualifier that changes what a reader would do (for example, the claim keeps one of two options the quote gives, or applies to everyone a step the quote limits to some patients).

Examples:
- Claim "Fatal cases have been reported." Quote "There have been postmarketing cases of metformin-associated lactic acidosis, including fatal cases." → supported.
- Claim "Take it with food to prevent lactic acidosis." Quote "…given with meals." → not supported: the quote says nothing about preventing lactic acidosis.
- Claim "Monitor potassium." Quote "Monitor serum potassium periodically in patients with renal impairment." → not supported: the claim drops "in patients with renal impairment".

Return JSON only: {"supported": boolean, "reason": string}.
