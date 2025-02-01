import dotenv from "dotenv";

import { initializeWebSocket } from "./ws";
import { server } from "./app";

dotenv.config();

const PORT = process.env.PORT || 5000;

// Create HTTP server

// Initialize WebSocket
initializeWebSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
