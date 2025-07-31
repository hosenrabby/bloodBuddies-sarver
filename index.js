require('dotenv').config();
const { config } = require('dotenv');
const express = require('express');
const cors = require('cors');
const app = express()

const admin = require("firebase-admin");
const decodeFBserviceKey = Buffer.from(process.env.FIREBASE_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decodeFBserviceKey);

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const paymentsInfoCollection = client.db('bloodBuddies').collection('paymentsInfo')

    // verify admin for apis ============================
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      if (!email) {
        return res.status(401).json({ message: 'Unauthorized: No email in token' });
      }
      const user = await userCollection.findOne({ email: email });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (user.role === 'Admin' || user.role === 'SuperAdmin') {
        return next();
      }
      return res.status(403).json({ message: 'Forbidden: Admin access only' });
    }

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
    // all data count documents
    app.get("/all-data-countDocuments", verifyFirebaseToken, async (req, res) => {
      const usersCount = await userCollection.countDocuments();
      const donorsCount = await userCollection.countDocuments({ status: 'Active' });
      const donationReqsCount = await donationRequestCollection.countDocuments();
      const allPayments = await paymentsInfoCollection.find().toArray();
      const totalPayments = allPayments.reduce((sum, payment) => sum + payment.amount, 0);

      res.send({
        usersCount,
        donorsCount,
        donationReqsCount,
        totalPayments
      });
    });
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

    app.get("/recent-donation-requestsByEmail", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email
      // console.log(email)
      const myRecentRequest = await donationRequestCollection.find({ requesterEmail: email }).sort({ _id: -1 }).limit(3).toArray()
      res.send(myRecentRequest)
    })
    // filtering donation status
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
    // filtering donation status
    app.get("/filteringUserStatus", verifyFirebaseToken, async (req, res) => {
      const filterStatus = req.query.filterValue;
      // console.log(filterStatus)
      const query = { status: filterStatus };
      if (filterStatus == 'All') {
        const filtered = await userCollection.find().toArray();
        res.send(filtered);
      } else {
        const filtered = await userCollection.find(query).toArray();
        res.send(filtered);
      }
    })
    app.get("/filteringDonationStatusByEmail", verifyFirebaseToken, async (req, res) => {
      const filterStatus = req.query.filterValue;
      const email = req.decoded.email;

      let filtered;
      if (filterStatus === 'All') {
        filtered = await donationRequestCollection.find({ requesterEmail: email }).toArray();
      } else {
        filtered = await donationRequestCollection.find({ status: filterStatus, requesterEmail: email }).toArray();
      }
      res.send(filtered);
    });
    app.get("/search-donors", async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;

      const query = {
        role: "Donor",
        status: "Active", // Optional: only show active users
        bloodGroup: bloodGroup,
        district: district, // this should match the `id` in district collection
        upazila: upazila
      };

      const donors = await userCollection.find(query).toArray();
      res.send(donors);
    });

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
      const id = req.params.donation_id;
      const donationId = new ObjectId(id);
      const myDonationRequest = await donationRequestCollection.findOne({ _id: donationId });
      res.send(myDonationRequest);
    });
    // get blogContent data by id
    app.get("/getContentData-forUpdate/:content_id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.content_id;
      const contentId = new ObjectId(id);
      const contentData = await blogCollection.findOne({ _id: contentId });
      res.send(contentData);
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
    app.put('/update-forDonation-status/:DR_id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.DR_id;
      const query = { _id: new ObjectId(id) };
      const donorData = req.body;
      const options = { upsert: true }
      const updated = await donationRequestCollection.updateOne(query, { $set: { ...donorData, status: 'Inprogress' } }, options)
      res.send(updated)
    })
    // update blogs request
    app.put('/update-blog/:content_id', verifyFirebaseToken, async (req, res) => {
      const id = req.params.content_id;
      const query = { _id: new ObjectId(id) };
      const blogData = req.body;
      const options = { upsert: true }
      const updated = await blogCollection.updateOne(query, { $set: blogData }, options)
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

    // for donation request pagination 
    app.get("/paginated-donation-requests", verifyFirebaseToken, async (req, res) => {
      const startIndex = parseInt(req.query.startIndex);
      const endIndex = parseInt(req.query.endIndex);
      if (isNaN(startIndex) || isNaN(endIndex) || startIndex < 0 || endIndex <= startIndex) {
        return res.status(400).json({ message: "Invalid startIndex or endIndex" });
      }
      const limit = endIndex - startIndex;
      const paginatedData = await donationRequestCollection.find().skip(startIndex).limit(limit).toArray();
      const total = await donationRequestCollection.countDocuments();
      res.send({
        data: paginatedData,
        total,
        startIndex,
        endIndex,
        hasMore: endIndex < total
      });
    });
    // for my donation request pagination 
    app.get("/paginated-donation-requestsByEmail", verifyFirebaseToken, async (req, res) => {
      const email = req.decoded.email
      const startIndex = parseInt(req.query.startIndex);
      const endIndex = parseInt(req.query.endIndex);
      if (isNaN(startIndex) || isNaN(endIndex) || startIndex < 0 || endIndex <= startIndex) {
        return res.status(400).json({ message: "Invalid startIndex or endIndex" });
      }
      const limit = endIndex - startIndex;
      const paginatedData = await donationRequestCollection.find({ requesterEmail: email }).skip(startIndex).limit(limit).toArray();
      const total = await donationRequestCollection.countDocuments({ requesterEmail: email });
      res.send({
        data: paginatedData,
        total,
        startIndex,
        endIndex,
        hasMore: endIndex < total
      });
    });
    // for my donation request pagination 
    app.get("/paginated-all-FundsByEmail", verifyFirebaseToken, async (req, res) => {
      const email = req.decoded.email
      const startIndex = parseInt(req.query.startIndex);
      const endIndex = parseInt(req.query.endIndex);
      if (isNaN(startIndex) || isNaN(endIndex) || startIndex < 0 || endIndex <= startIndex) {
        return res.status(400).json({ message: "Invalid startIndex or endIndex" });
      }
      const limit = endIndex - startIndex;
      const paginatedData = await paymentsInfoCollection.find({ userEmail: email }).skip(startIndex).limit(limit).toArray();
      const total = await paymentsInfoCollection.countDocuments({ userEmail: email });
      res.send({
        data: paginatedData,
        total,
        startIndex,
        endIndex,
        hasMore: endIndex < total
      });
    });
    // for my donation request pagination 
    app.get("/paginated-donation-reqByPending", async (req, res) => {
      const startIndex = parseInt(req.query.startIndex);
      const endIndex = parseInt(req.query.endIndex);
      if (isNaN(startIndex) || isNaN(endIndex) || startIndex < 0 || endIndex <= startIndex) {
        return res.status(400).json({ message: "Invalid startIndex or endIndex" });
      }
      const limit = endIndex - startIndex;
      const paginatedData = await donationRequestCollection.find({ status: 'Pending' }).skip(startIndex).limit(limit).toArray();
      const total = await donationRequestCollection.countDocuments({ status: 'Pending' });
      res.send({
        data: paginatedData,
        total,
        startIndex,
        endIndex,
        hasMore: endIndex < total
      });
    });
    app.get("/donation-request-details/:id", verifyFirebaseToken, async (req, res) => {
      const donationId = req.params.id;
      const objectId = new ObjectId(donationId);
      const donation = await donationRequestCollection.findOne({ _id: objectId });
      if (!donation) {
        return res.status(404).send({ message: "Donation request not found" });
      }
      res.send(donation);
    });
    // for my donation request pagination 
    app.get("/paginated-all-blogs", verifyFirebaseToken, async (req, res) => {
      const startIndex = parseInt(req.query.startIndex);
      const endIndex = parseInt(req.query.endIndex);
      if (isNaN(startIndex) || isNaN(endIndex) || startIndex < 0 || endIndex <= startIndex) {
        return res.status(400).json({ message: "Invalid startIndex or endIndex" });
      }
      const limit = endIndex - startIndex;
      const paginatedData = await blogCollection.find().skip(startIndex).limit(limit).toArray();
      const total = await blogCollection.countDocuments();
      res.send({
        data: paginatedData,
        total,
        startIndex,
        endIndex,
        hasMore: endIndex < total
      });
    });
    // for my donation request pagination 
    app.get("/paginated-all-blogsByPublished", async (req, res) => {
      const startIndex = parseInt(req.query.startIndex);
      const endIndex = parseInt(req.query.endIndex);
      if (isNaN(startIndex) || isNaN(endIndex) || startIndex < 0 || endIndex <= startIndex) {
        return res.status(400).json({ message: "Invalid startIndex or endIndex" });
      }
      const limit = endIndex - startIndex;
      const paginatedData = await blogCollection.find({ status: 'Published' }).skip(startIndex).limit(limit).toArray();
      const total = await blogCollection.countDocuments();
      res.send({
        data: paginatedData,
        total,
        startIndex,
        endIndex,
        hasMore: endIndex < total
      });
    });
    app.get('/blog-details/:id', async (req, res) => {
      const blog = await blogCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!blog) return res.status(404).send({ message: 'Not found' });
      res.send(blog);
    });
    // for my donation request pagination 
    app.get("/paginated-all-usersByAdmin", verifyFirebaseToken, async (req, res) => {
      const startIndex = parseInt(req.query.startIndex);
      const endIndex = parseInt(req.query.endIndex);
      const query = { role: { $ne: "SuperAdmin" } };
      if (isNaN(startIndex) || isNaN(endIndex) || startIndex < 0 || endIndex <= startIndex) {
        return res.status(400).json({ message: "Invalid startIndex or endIndex" });
      }
      const limit = endIndex - startIndex;
      const paginatedData = await userCollection.find(query).skip(startIndex).limit(limit).toArray();
      const total = await userCollection.countDocuments();
      res.send({
        data: paginatedData,
        total,
        startIndex,
        endIndex,
        hasMore: endIndex < total
      });
    });

    // Stripe Payment API
    app.post('/create-payment-intent', async (req, res) => {
      try {
        const { amount } = req.body;

        if (!amount || isNaN(amount)) {
          return res.status(400).json({ error: "Amount is required and must be a number." });
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100, // amount in cents (e.g. $10 = 1000)
          currency: 'usd',
          payment_method_types: ['card'],
        });

        res.status(200).send({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.error("Stripe Error:", error.message);
        res.status(500).json({ error: error.message });
      }
    });
    // add payment information ============================
    app.post('/paymant-success-data', verifyFirebaseToken, async (req, res) => {
      const paynentInfo = req.body
      const payment = await paymentsInfoCollection.insertOne(paynentInfo)
      res.send(payment)
    })




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