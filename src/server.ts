import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import filePath from "./filePath";
import { Client } from "pg";

const app = express();

/** Parses JSON data in a request automatically */
app.use(express.json());
/** To allow 'Cross-Origin Resource Sharing': https://en.wikipedia.org/wiki/Cross-origin_resource_sharing */
app.use(cors());

// read in contents of any environment variables in the .env file
dotenv.config();

const herokuSSLSetting = { rejectUnauthorized: false };
const sslSetting = process.env.LOCAL ? false : herokuSSLSetting;
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: sslSetting,
};
const client = new Client(dbConfig);

client.connect();

// API info page
app.get("/", (req, res) => {
  const pathToFile = filePath("../public/index.html");
  res.sendFile(pathToFile);
});

// Return user ids and names
app.get("/users", async (req, res) => {
  try {
    const dbres = await client.query("select id, name, team_id from users");
    if (dbres.rowCount === 0) {
      res.status(400).json({ status: "failed", message: "response is empty" });
    } else {
      res.status(200).json({ status: "success", data: dbres.rows });
    }
  } catch (error) {
    console.error(error);
  }
});

// Post new standup
app.post<{ team_id: number }>("/standups/:team_id", async (req, res) => {
  const team_id = req.params.team_id;
  // Check if team_id is valid
  try {
    const isTeam = await client.query("Select * from teams where id = $1", [
      team_id,
    ]);
    if (isTeam.rowCount === 0) {
      res
        .status(404)
        .json({ status: "failed", message: `No team with ID ${team_id}` });
    }
  } finally {
    try {
      const { time, chair_id, meeting_link, notes } = req.body;
      const dbres = await client.query(
        "INSERT INTO standups (team_id, time, chair_id, meeting_link, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *;",
        [team_id, time, chair_id, meeting_link, notes]
      );
      if (dbres.rowCount !== 0) {
        res.status(200).json({ status: "success", data: dbres.rows });
      } else {
        res.status(400).json({ status: "failed" });
      }
    } catch (error) {
      console.error(error);
    }
  }

  // Post to database
  // console.log(team_id);
});

// GET previous stand ups
app.get<{ team_id: number }>(
  "/standups/previous/:team_id",
  async (req, res) => {
    try {
      const team_id = req.params.team_id;
      const dbres = await client.query(
        "Select * from standups where team_id = $1 and time < now() order by time desc limit 5;",
        [team_id]
      );
      if (dbres.rowCount !== 0) {
        res.status(200).json({ status: "success", data: dbres.rows });
      } else {
        res.status(400).json({ status: "failed" });
      }
    } catch (error) {
      console.error(error);
    }
  }
);

// Get the next standup
app.get<{ team_id: number }>("/standups/next/:team_id", async (req, res) => {
  const team_id = req.params.team_id;

  // Check that team exists
  try {
    const isTeam = await client.query("Select * from teams where id = $1", [
      team_id,
    ]);
    if (isTeam.rowCount === 0) {
      res
        .status(404)
        .json({ status: "failed", message: `No team with ID ${team_id}` });
    }
  } catch (error) {
    console.error(error);
  }

  try {
    const dbres = await client.query(
      "select * from standups where team_id = $1 and time > now() order by time asc limit 1;",
      [team_id]
    );
    if (dbres.rowCount !== 0) {
      res.status(200).json({ status: "success", data: dbres.rows });
    } else {
      res
        .status(401)
        .json({ status: "failed", message: "no upcoming standups" });
    }
  } catch (error) {
    console.error(error);
  }
});

const port = process.env.PORT;
if (!port) {
  throw "Missing PORT environment variable.  Set it in .env file.";
}
app.listen(port, () => {
  console.log(`Server is up and running on port ${port}`);
});

export default app;
