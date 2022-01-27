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
        "Select standups.id, standups.team_id, standups.time, standups.chair_id, standups.meeting_link, standups.notes, users.name as chair_name from standups join users on standups.chair_id = users.id where standups.team_id = $1 and time < now() order by time desc limit 5;",
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
      "select standups.id, standups.team_id, standups.time, standups.chair_id, standups.meeting_link, standups.notes, users.name as chair_name from standups join users on standups.chair_id = users.id where standups.team_id = $1 and time > now() order by time asc limit 1;",
      [team_id]
    );

    res.status(200).json({ status: "success", data: dbres.rows });
  } catch (error) {
    console.error(error);
  }
});

app.get<{ team_id: number }>("/teamname/:team_id", async (req, res) => {
  const team_id = req.params.team_id;
  try {
    const dbres = await client.query("select * from teams where id = $1", [
      team_id,
    ]);
    if (dbres.rowCount === 0) {
      res
        .status(404)
        .json({ status: "failed", message: `No team with ID ${team_id}` });
    } else {
      res.status(200).json({ status: "success", data: dbres.rows[0] });
    }
  } catch (error) {
    console.log(error);
  }
});

app.get<{ standup_id: number }>(
  "/standups/activities/:standup_id",
  async (req, res) => {
    try {
      const dbres = await client.query(
        "SELECT * FROM activities WHERE standup_id = $1;",
        [req.params.standup_id]
      );
      if (dbres.rowCount !== 0) {
        res.status(200).json({ status: "success", data: dbres.rows });
      } else {
        res.status(200).json({
          status: "success",
          data: dbres.rows,
          message: "No activities for this standup",
        });
      }
    } catch (error) {
      console.error(error);
      res.status(400).json({ status: "failed" });
    }
  }
);

// updating notes
app.put<{ standup_id: number }>(
  "/standups/notes/:standup_id",
  async (req, res) => {
    const standup_id = req.params.standup_id;

    try {
      // Check if stand up exists
      const isTeam = await client.query(
        "Select * from standups where id = $1",
        [standup_id]
      );
      // console.log("Hey")
      if (isTeam.rowCount === 0) {
        res.status(404).json({
          status: "failed",
          message: `No standup with ID ${standup_id}`,
        });
      }
    } finally {
      try {
        const { notes } = req.body;
        const dbres = await client.query(
          "update standups set notes = $1 where id = $2 returning *;",
          [notes, standup_id]
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
  }
);

// get teammates for given team_id
app.get<{ team_id: number }>("/teams/members/:team_id", async (req, res) => {
  try {
    const dbres = await client.query("select * from users where team_id = $1", [
      req.params.team_id,
    ]);
    if (dbres.rowCount === 0) {
      res.status(400).json({ status: "failed", message: "response is empty" });
    } else {
      res.status(200).json({ status: "success", data: dbres.rows });
    }
  } catch (error) {
    console.error(error);
  }
});

app.post<{ standup_id: number }>("/activity/:standup_id", async (req, res) => {
  const standup_id = req.params.standup_id;
  try {
    const isTeam = await client.query("Select * from standups where id = $1", [
      standup_id,
    ]);
    if (isTeam.rowCount === 0) {
      res.status(404).json({
        status: "failed",
        message: `No standup with ID ${standup_id}`,
      });
    }
  } finally {
    try {
      const { user_id, name, url, comment } = req.body;
      const dbres = await client.query(
        "insert into activities (standup_id, user_id, name, url, comment) values ($1, $2, $3, $4, $5) returning *;",
        [standup_id, user_id, name, url, comment]
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
});

app.put<{ activity_id: number }>("/activity/:activity_id", async (req, res) => {
  const activity_id = req.params.activity_id;
  try {
    const isTeam = await client.query(
      "Select * from activities where id = $1",
      [activity_id]
    );
    if (isTeam.rowCount === 0) {
      res.status(404).json({
        status: "failed",
        message: `No activity with ID ${activity_id}`,
      });
    }
  } finally {
    try {
      const { name, url, comment } = req.body;
      const dbres = await client.query(
        "update activities set name = $1, url= $2, comment= $3 where id= $4 returning *;",
        [name, url, comment, activity_id]
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
});

app.put<{ standup_id: number }>("/standups/:standup_id", async (req, res) => {
  const standup_id = req.params.standup_id;
  try {
    const isTeam = await client.query("Select * from standups where id = $1", [
      standup_id,
    ]);
    if (isTeam.rowCount === 0) {
      res.status(404).json({
        status: "failed",
        message: `No standup with ID ${standup_id}`,
      });
    }
  } finally {
    try {
      const { time, chair_id, meeting_link } = req.body;
      const dbres = await client.query(
        "update standups set time = $1, chair_id= $2, meeting_link = $3 where id= $4 returning *;",
        [time, chair_id, meeting_link, standup_id]
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
});

const port = process.env.PORT;
if (!port) {
  throw "Missing PORT environment variable.  Set it in .env file.";
}
app.listen(port, () => {
  console.log(`Server is up and running on port ${port}`);
});

export default app;
