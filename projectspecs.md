# Todo10kr
What are you actually trying to do?
-Get people achieve what they wanted to do by agentic todo.

v1
- build a simple todo( sugested todo(dummy), with actualy dump todo)
- ai generate task for the day.

v2
- get gcal integeration, and find out missing slots
- filled that missing slots with the todo in it. using an api.
- best day look like

v3
- now put agentic reasoning on how to fill the missing slots.

- suggested todo should be based on goals and find out suggested and stored in database.
----------------------------
MVP
----------------------------
Mvp: user input milestones,
ai take free Gcal slots, 
find resources on your milestones,
- insert in free slots.
----------------------------
v1
- agents for each suggested resources doing work.
- etc
----------------------------
v2 
- Main ai making intelligent decision on how the slots should be selected reasoning on about energy, percentage of work done of milestones etc.
--------------------------
v3
- dump basic todo as well that it might placed in between free time not only in milestone.
---------------------------
Later
- The agent has much broad context of whole month todo. what is being achieved, specific deadilines context etc.ex: YC deadline 2 days ago. (knows how much time it will take and its better to keep that in priority)(so better database.)

Not in scope
----------------------------
- Gain a better understanding of user context, goals, and current activities.
- Automatically identify and email potential contacts for opportunities (e.g., inviting to be a speaker or judge) based on user location and interests.
- Send alerts/notifications for confirmations, letting the user confirm their participation easily.
- If confirmed, automatically set up the event by emailing relevant parties.
- Integrate with Calendly to schedule meetings with people efficiently.
- Facilitate daily conversations with new people to encourage learning and mentoring.
- Stay updated on industry trends and provide tailored mentoring suggestions to help users achieve their goals.


Having better understanding about me, my context, what am i doing in life etc that helps with emailing real people to be a speaker or to be a judge somewhere based on your location etc. you get alert on confirmation notification  and you can confirm whether you want to do and it sets up for you by emailing them .has 
access to calendly and it sets the meeting with people, talk with people daily. learn new things in the market and mentor on what you need to  achieve better.


------------------------------
Plan for MVP v1:
Phase 1 — Goals as first-class data (no agents yet) ✋ start here
What: Add Goal model. UI to add/edit/list goals with horizon + priority. Goals appear as static context but don't yet generate anything.

Why first: Nothing intelligent works without a goal model. You'll know it's done when you can add "Learn Spanish, 1 year, priority 3" and see it persisted.

Files to add:

backend/src/data/goals.js
backend/src/routes/goals.routes.js (GET, POST, PATCH, DELETE)
Frontend: a Goals section above your existing Dump/Suggested cards
Phase 2 — One Goal Agent (single LLM call per goal)
What: For each goal, write a function that asks the LLM to produce 1-3 candidate todos in JSON, given the goal + recent activity. No browser tools yet.

Why second: Prove the agent shape before you have many. Use it to replace the static suggestedTodos array.

Files to add:

backend/src/services/goalAgent.service.js — runGoalAgent(goal, context)
New endpoint: POST /api/goals/:id/propose returns this turn's candidates
Frontend: a "Refresh suggestions" button per goal
Phase 3 — Orchestrator that merges everything
What: Refactor generateSmartSchedule into an orchestrator that takes dumpTodos + proposals[] + freeSlots and emits the daily plan with explicit reasoning per slot ("scheduled gym because last 3 completed items were job applications").

Why third: This is where the intelligence shows up. Before this you just have suggestion lists; after this you have a real plan.

Files to refactor:

Rename services/openai.service.js#generateSmartSchedule → services/orchestrator.service.js#orchestrate
Have schedule.routes.js call runGoalAgent for each active goal, collect proposals, then orchestrate(...)
