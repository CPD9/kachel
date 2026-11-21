# Glossary

Words used across Kachel, in plain terms.

**Agent.** A small Python program on the server box (`services/agent`). It pauses and resumes the
real job when told to, and reports each change to the database.

**Backlog.** Work with no deadline, such as making embeddings, that can fill any hour the house
wants heat. The model assumes there is always some; that is its most optimistic assumption.

**Backup heater.** The house's own heating, which tops up when the servers and the tank cannot
cover the demand.

**Batch job.** A job that can pause but has a deadline, such as transcribing recordings within
24 hours.

**Break-even.** The lowest price per server-hour at which a server stops losing money. Before
hardware it is 0.188 CHF; with hardware, 0.31 to 0.65 CHF, depending on the case.

**Case brief.** The DigitalHeat hackathon's description of a reference house: tank, hot water,
server power, heat recovery, COP and the heating formula.

**COP (coefficient of performance).** How much heat a heat pump makes from 1 kWh of electricity.
At a COP of 2.5 it makes 2.5 kWh of heat. The better the heat pump, the less server heat is
worth.

**Data centre.** In the fleet, where a job goes when no house can use its heat in time. Its heat
is lost.

**Dumped heat.** Server heat the house could not use or store. Only interactive sessions, which
cannot wait, make it.

**Embedding.** Turning a piece of text into a list of numbers a computer can compare. Our
measured backlog job makes embeddings.

**Fleet.** Many houses sharing one stream of jobs, each job sent to where its heat is most useful
this hour.

**Heat credit.** What a heat pump would have spent on electricity to make the heat the servers
gave. It counts as money saved.

**Heat recovery.** The share of a server's electricity that comes back as useful heat. The model
uses 80%.

**Heat sink.** Anywhere heat can go and be useful: space heating, hot water, the tank. In summer
a house has little of it.

**Heating degree days (20/12).** A Swiss way to measure how cold a year was: on each day with a
mean below 12 °C, count how far it is below 20 °C.

**Host.** The homeowner or building operator who has servers in the basement.

**Interactive session.** A job someone is waiting on, such as a local AI chat. It runs at once
and cannot be paused.

**kWh, kWp, Rp.** A kilowatt-hour is energy: 1 kW for one hour. A kilowatt-peak is a solar
roof's size in full sun. A Rappen is a hundredth of a Swiss franc.

**NPV (net present value).** All the money in and out over the hardware's life, with later years
counted for less at the discount rate. Above zero, it pays.

**Payback.** The years until the yearly cash has repaid what was paid up front.

**Plate heat exchanger.** Thin metal plates that pass heat from the servers' water to the tank's.

**Realtime.** Supabase's way of telling an app the moment a row changes, so the screen updates
without a reload.

**RLS (row level security).** Rules in the database that decide which rows each signed-in person
may read or write.

**Server-hour.** One server running for one hour. It uses 1 kWh of electricity and gives 0.8 kWh
of heat in the model.

**SIGSTOP, SIGCONT.** The signals that freeze a running program and let it carry on. The job
keeps its memory in between.

**Tank.** The hot-water store in the basement, 35 kWh in the reference house. It lets heat made
now be used later.

**Utilisation.** The share of all hours in the year that the servers run: 59.1% in the reference
house.
