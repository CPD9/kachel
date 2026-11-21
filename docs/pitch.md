# Pitch and demo script

Five minutes at FHNW Campus Dreispitz, Basel, during the 36-hour sprint on Basel's climate
goal. Key figures first, then the live part. Every figure on screen comes from the README
table, which `scripts/readme-figures.mjs` writes from the scheduler's `kpis.json`.

## 0:00 to 0:30: the line

"Your AI heats your home."

Small servers in a home's basement run AI jobs. Their heat goes into space heating and hot
water instead of a data centre's cooling towers.

## 0:30 to 1:30: the figures

Show the README figures table and read three of them out: the share of the house's heat
demand covered, the break-even price per server-hour, and the heat dumped. Then say when it
does not pay off, from the README section of that name.

## 1:30 to 2:30: the rules

The scheduler runs a job only when its heat is useful:

1. Live sessions run now.
2. Deadline jobs wait until the house wants heat.
3. The backlog fills what is left.
4. Otherwise the server is off.

## 2:30 to 4:30: live

1. A January day: the tank fills, the radiators and the shower are served, the servers stay
   busy.
2. A July day: only hot water is wanted, so deadline jobs wait and servers switch off.
3. One real job: the agent pauses it when the tank is full and resumes it when heat is
   wanted again. The pill in the console flips from Running to Paused and back.

## 4:30 to 5:00: close

Who it is for: homeowners and building operators who want cheaper heat, and buyers who want
compute that does double duty. Then the team.
