🎯 Core Concept
You and your fellow neurons must collaboratively guide a human through awkward, chaotic, or emotionally charged life situations by “voting” with your movement on a shared psychological map. Each situation is resolved based on your group’s collective emotional stance — even when that stance gets messy.

🕹️ Gameplay Loop
1. Situation Presented
A bizarre or relatable scenario is shown on screen.
Example: “Your mom accidentally likes an ex’s Instagram post from your phone.”

2. Spatial Voting Phase

Each of the players controls a "neuron" on the map.

Dynamic Axis Generation (via LLM)
	•	The game prompts an LLM with the situation to generate the two most relevant psychological/emotional dimensions.
	•	Example axes for this scenario:
	•	Axis 1: Avoidance ↔ Approach
	•	Axis 2: Vindictive ↔ Empathetic
	•	The game displays these axes on a 2D quadrant map, with the four corners representing combinations of extremes, with a color gradient across the 4
  •	The game also shows a dynamic bar indicating how what the current average vote is across the axes

Players move their avatar to the location that matches the response they feel is best.

3. Team Response Calculated

The team’s “vote” is the average position of all players, they have 30 seconds in first round, 20 in 2nd, 10 in 3rd and 5 seconds in 4th round (it ramps up)

This average is used to compute where on the emotional scales the team landed (e.g., 70% Avoidant, 60% Vindictive).

Meters for each axis (e.g., Approach ↔ Avoidance, Vindictive ↔ Empathy) reflect this result in real time or after locking in.

4. Ideal Target

There is a hidden ideal response zone (generated via LLM but hidden from users).

After voting, you reveal how close (or far) the team was from the ideal.

At the end of the game (after 4 rounds), the script is replayed and a score is generated.

5. Cutscene or Response Played Out

Based on the chosen emotional outcome, the game calls an LLM to generate a reaction narrative.

A short cutscene (text-based) plays out.
Example: “You pull your mom aside and ask why she was snooping. She responds with a mix of confusion and guilt. The air is tense.”

6. Consequences or Score

Ongoing meters for Mental Stability, Social Reputation, or Chaos can track your team’s progress through multiple scenarios.