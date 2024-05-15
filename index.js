const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 8000;

const app = express();

// middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://studysphere-1f8dd.web.app",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: "unauthorized access" });
  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        console.log(err);
        return res.status(401).send({ message: "unauthorized access" });
      }
      req.user = decoded;
      next();
    });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.irefuhm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const assignmentCollection = client
      .db("studySphereDB")
      .collection("assignments");
    const submittedAssignmentCollection = client
      .db("studySphereDB")
      .collection("submittedAssignments");

    //jwt generate
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // Clear token on logOut

    app.get("/logOut", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          maxAge: 0,
        })
        .send({ success: true });
    });

    // save a new created assignment on mongodb
    app.post("/assignments", async (req, res) => {
      const assignmentData = req.body;
      const result = await assignmentCollection.insertOne(assignmentData);
      res.send(result);
    });
    // save a new submitted assignment on mongodb
    app.post("/submitted-assignments", async (req, res) => {
      const assignmentData = req.body;
      const assignmentId = assignmentData?.assignmentId;
      const result = await submittedAssignmentCollection.insertOne(
        assignmentData
      );
      const updateDoc = {
        $inc: { assignmentTakeCount: 1 },
      }
      const jobQuery = { _id: new ObjectId(assignmentId) }
      const updateBidCount = await assignmentCollection.updateOne(jobQuery, updateDoc)
      res.send(result);
    });

    // get a assignment by using Id
    app.get("/assignment/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await assignmentCollection.findOne(query);
      res.send(result);
    });

    // get all assignments from mongodb server
    app.get("/assignments", async (req, res) => {
      const result = await assignmentCollection.find().toArray();
      res.send(result);
    });
    // get all assignments for a specific user from mongodb server
    app.get("/assignments/:email", verifyToken, async (req, res) => {
      const tokenEmail = req.user.email;
      const email = req.params.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { "assignmentCreator.email": email };
      const result = await assignmentCollection.find(query).toArray();
      res.send(result);
    });
    // get submitted assignments for a specific user by email from mongodb server
    app.get("/submitted-assignments/:email", verifyToken, async (req, res) => {
      const tokenEmail = req.user.email;
      const email = req.params.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { "examineeUser.email": email };
      const result = await submittedAssignmentCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/my-checked-assignments/:email", verifyToken,  async (req, res) => {
      const tokenEmail = req.user.email;
      const email = req.params.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { "Examiner.email": email, status: 'Completed' };
      const result = await submittedAssignmentCollection.find(query).toArray();
      res.send(result);
    });
    // get submitted assignments which status is  pending for mark from mongodb server
    app.get("/pending-assignments/:status", async (req, res) => {
      const status = req.params.status;
      const query = { status: status };
      const result = await submittedAssignmentCollection.find(query).toArray();
      res.send(result);
    });

    // update a submitted assignment after Giving mark
    app.put("/submitted-assignment/:id", async (req, res) => {
      const id = req.params.id;
      const updateAssignmentData = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...updateAssignmentData,
        },
      };
      const result = await submittedAssignmentCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    // update a assignment
    app.put("/assignment/:id", async (req, res) => {
      const id = req.params.id;
      const assignmentData = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          ...assignmentData,
        },
      };
      const result = await assignmentCollection.updateOne(
        query,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // Delete a assignment from mongodb server
    app.delete("/assignment/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await assignmentCollection.deleteOne(query);
      res.send(result);
    });

    // Get all assignment data from db for pagination
    app.get("/all-assignments", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const filter = req.query.filter;
      const sort = req.query.sort;
      const search = req.query.search;
      let query = {
        assignment_title: { $regex: search, $options: "i" },
      };
      if (filter) query.difficultyLevel = filter;
      let options = {};
      if (options) options = { sort: { deadline: sort === "asc" ? 1 : -1 } };
      const result = await assignmentCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // Get all assignment data count from db
    app.get("/assignments-count", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      if (typeof search !== "string") {
        search = "";
      }
      let query = {
        assignment_title: { $regex: search, $options: "i" },
      };
      if (filter) query.difficultyLevel = filter;
      const count = await assignmentCollection.countDocuments(query);
      res.send({ count });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello, studySphere Server is Running...........");
});

app.listen(port, () => {
  console.log(`server running on port ${port}`);
});
