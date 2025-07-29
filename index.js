require('dotenv').config();
const { config } = require('dotenv');
const express = require('express');
const cors = require('cors');
const app = express()

var admin = require("firebase-admin");
var serviceAccount = require("./blood-buddies-36241-firebase-adminsdk-fbsvc-66f478f57c.json");

const port = process.env.PORT || 3000;

// Middlewares ============================

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'UnAuthorized Access' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    // console.log('decoded token', decoded)
    req.decoded = decoded
    next()
  } catch (error) {
    return res.status(401).send({ message: 'UnAuthorized Access' })
  }
}


app.use(cors());
app.use(express.json());


// Mongodb cunncetion=====================================
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const e = require('express');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kfhyg8b.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const run = async () => {
  try {
    // Blood Buddies apis====================================
    const userCollection = client.db('bloodBuddies').collection('users')
    const divisionCollection = client.db('bloodBuddies').collection('divisions')
    const districtCollection = client.db('bloodBuddies').collection('districts')
    const upazilaCollection = client.db('bloodBuddies').collection('upazilas')
    const donationRequestCollection = client.db('bloodBuddies').collection('donationRequests')
    const blogCollection = client.db('bloodBuddies').collection('blogs')

    // get district with divisios==========================
    app.get('/divisions', async (req, res) => {
      const division = await divisionCollection.find().toArray()
      res.send(division);
    })
    app.get('/districts', async (req, res) => {
      const district = await districtCollection.find().toArray()
      res.send(district);
    })
    app.get('/upazilas', async (req, res) => {
      const upazila = await upazilaCollection.find().toArray()
      res.send(upazila);
    })

    // all data by cullectiron api
    app.get("/all-users", verifyFirebaseToken, async (req, res) => {
      const users = await userCollection.find().toArray()
      res.send(users)
    })
    app.get("/all-donation-requests", verifyFirebaseToken, async (req, res) => {
      const donationRequest = await donationRequestCollection.find().toArray()
      res.send(donationRequest)
    })
    app.get("/all-blogs", verifyFirebaseToken, async (req, res) => {
      const allBlogs = await blogCollection.find().toArray()
      res.send(allBlogs)
    })
    // Lloged in user 
    app.get("/userMatchByEmail", verifyFirebaseToken, async (req, res) => {
      const userData = await userCollection.findOne({ email: req.decoded.email })
      res.send(userData)
    })
    // get user role
    app.get("/get-user-role", verifyFirebaseToken, async (req, res) => {
      const user = await userCollection.findOne({ email: req.decoded.email });
      res.send({ role: user.role, status: user.status });
    });

    app.get("/donation-requestsByEmail", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email
      // console.log(email)
      const myDonationRequest = await donationRequestCollection.find({ requesterEmail: email }).toArray()
      res.send(myDonationRequest)
    })
    app.get("/filteringDonationStatus", verifyFirebaseToken, async (req, res) => {
      const filterStatus = req.query.filterValue;
      // console.log(filterStatus)
      const query = { status: filterStatus };
      if (filterStatus == 'All') {
        const filtered = await donationRequestCollection.find().toArray();
        res.send(filtered);
      } else {
        const filtered = await donationRequestCollection.find(query).toArray();
        res.send(filtered);
      }
    })
    app.get("/filteringBlogStatus", verifyFirebaseToken, async (req, res) => {
      const filterStatus = req.query.filterValue;
      // console.log(filterStatus)
      const query = { status: filterStatus };
      if (filterStatus == 'All') {
        const filtered = await blogCollection.find().toArray();
        res.send(filtered);
      } else {
        const filtered = await blogCollection.find(query).toArray();
        res.send(filtered);
      }
    })
    // get donation request data by id
    app.get("/getDoantionReqData-forUpdate/:donation_id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.donation_id
      const donationId = new ObjectId(id)
      // console.log(donationId)
      const myDonationRequest = await donationRequestCollection.find({ _id: donationId })
      res.send(myDonationRequest)
    })
    // get blogContent data by id
    app.get("/getContentData-forUpdate/:content_id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.content_id;
      const contentId = new ObjectId(id);
      const contentData = await blogCollection.findOne({ _id: contentId });
      res.send(contentData);
    });
    // user data except admin emaail
    app.get("/usermatchByAdmin", verifyFirebaseToken, async (req, res) => {
      const { email } = req.decoded;
      try {
        // Query: match by email AND role is NOT "Admin"
        const query = {
          role: { $ne: "SuperAdmin" }  // $ne = "not equal"
        };
        const user = await userCollection.find(query).toArray();
        if (!user) {
          return res.status(404).send({ message: "User not found or is Admin" });
        }
        res.send(user);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch user", details: err.message });
      }
    });
    // Update Profile
    app.put('/update-profile', verifyFirebaseToken, async (req, res) => {
      const email = req.query.email
      const query = { email: email };
      const profileData = req.body;
      const options = { upsert: true }

      const updated = await userCollection.updateOne(query, { $set: profileData }, options)
      res.send(updated)
    })
    // Update Role and status
    app.put('/updateRoleOrStatus/:user_id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.user_id;
      const query = { _id: new ObjectId(id) };
      const { _id, ...updateRoleStatus } = req.body;
      const options = { upsert: true }

      const updated = await userCollection.updateOne(query, { $set: updateRoleStatus }, options)
      res.send(updated)
    })
    // update donation request status
    app.put('/updateDonationRequestStatus/:DR_id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.DR_id;
      const query = { _id: new ObjectId(id) };
      const { _id, ...updateRoleStatus } = req.body;
      const options = { upsert: true }
      const updated = await donationRequestCollection.updateOne(query, { $set: updateRoleStatus }, options)
      res.send(updated)
    })
    // update Blogs status
    app.put('/updateBlogstStatus/:blog_id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.blog_id;
      const query = { _id: new ObjectId(id) };
      const { _id, ...updateStatus } = req.body;
      const options = { upsert: true }
      const updated = await blogCollection.updateOne(query, { $set: updateStatus }, options)
      res.send(updated)
    })
    // update donation request
    app.put('/update-donation-request/:DR_id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.DR_id;
      const query = { _id: new ObjectId(id) };
      const donationData = req.body;
      const options = { upsert: true }
      const updated = await donationRequestCollection.updateOne(query, { $set: donationData }, options)
      res.send(updated)
    })
    // update blogs request
    app.put('/update-blog/:content_id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.content_id;
      const query = { _id: new ObjectId(id) };
      const blogData = req.body;
      const options = { upsert: true }
      const updated = await donationRequestCollection.updateOne(query, { $set: blogData }, options)
      res.send(updated)
    })


    // Donation requests Delete apis
    app.delete('/donationReq-del/:donation_id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.donation_id
      // console.log(id)
      const query = { _id: new ObjectId(id) }
      const deleteReq = await donationRequestCollection.deleteOne(query)
      res.send(deleteReq)
    })
    // blogs Delete apis
    app.delete('/blogs-del/:blog_id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.blog_id
      // console.log(id)
      const query = { _id: new ObjectId(id) }
      const deleteBlog = await blogCollection.deleteOne(query)
      res.send(deleteBlog)
    })


    // add user to data base ============================
    app.post('/add-userInfo', verifyFirebaseToken, async (req, res) => {
      const userData = req.body
      const newUser = await userCollection.insertOne(userData)
      res.send(newUser)
    })

    // add doantion request data api
    app.post('/add-donation-request', verifyFirebaseToken, async (req, res) => {
      const requestData = req.body
      const donationRequestData = await donationRequestCollection.insertOne(requestData)
      res.send(donationRequestData)
    })
    //  add blog data data api
    app.post('/create-blog', verifyFirebaseToken, async (req, res) => {
      const blogData = req.body
      const newBlogData = await blogCollection.insertOne(blogData)
      res.send(newBlogData)
    })
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally { }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Blood donner sarver is running')
})

app.listen(port, () => {
  console.log('Blood donner sarver is running on this port ,', port)
})