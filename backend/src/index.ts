import http from "http";
import { createApp } from "./app";
import { env } from "./env";
import { startCronJobs } from "./cron";
import { initSocketIO } from "./realtime";

const app = createApp();
const server = http.createServer(app);

initSocketIO(server);

server.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});

startCronJobs();
