const express = require('express')
const app = express()
const cors = require('cors');
const admin = require("firebase-admin");
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const fileUpload = require('express-fileupload');

const port = process.env.PORT || 5000;

const { privateKey } = JSON.parse(process.env.private_key);
const serviceAccount = {
  type: process.env.type,
  project_id: process.env.project_id,
  private_key_id: process.env.private_key_id,
  privateKey,
  client_email: process.env.client_email,
  client_id: process.env.client_id,
  auth_uri: process.env.auth_uri,
  token_uri: process.env.token_uri,
  auth_provider_x509_cert_url: process.env.auth_provider_x509_cert_url,
  client_x509_cert_url: process.env.client_x509_cert_url
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pabg0.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function verifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith('Bearer ')) {
    const token = req.headers.authorization.split(' ')[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    }
    catch { }
  }
  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db('doctors_portal');
    const appointmentsCollection = database.collection('appointments');
    const usersCollection = database.collection('users');
    const doctorsCollection = database.collection('doctors');

    // GET API for appointments
    app.get('/appointments', async (req, res) => {
      const email = req.query.email;
      const date = req.query.date;
      const query = { email: email, date: date };
      const cursor = appointmentsCollection.find(query);
      const appointments = await cursor.toArray();
      res.json(appointments);
    })

    app.get('/appointments/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await appointmentsCollection.findOne(query);
      res.json(result);
    })

    // POST API for appointments
    app.post('/appointments', verifyToken, async (req, res) => {
      const appointment = req.body;
      const result = await appointmentsCollection.insertOne(appointment);
      res.json(result);
    });

    // UPDATE API for appointments
    app.put('/appointments/:id', async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      console.log(payment);
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment: payment
        }
      };
      const result = await appointmentsCollection.updateOne(filter, updateDoc);
      res.json(result);
    })

    // POST API for doctors
    app.post('/doctors', async (req, res) => {
      // console.log('body', req.body);
      const name = req.body.name;
      const email = req.body.email;
      const pic = req.files.image;
      const picData = pic.data;
      const encodedPic = picData.toString('base64');
      const imageBuffer = Buffer.from(encodedPic, 'base64');
      const doctor = {
        name,
        email,
        image: imageBuffer
      }

      const result = await doctorsCollection.insertOne(doctor);
      console.log('files', req.files);
      res.json(result);
    })

    app.get('/doctors', async (req, res) => {
      const cursor = doctorsCollection.find({});
      const doctors = await cursor.toArray();
      res.json(doctors);
    })

    // GET API for specific user
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === 'admin') {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    })

    // POST API for users
    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.json(result);
    });

    // PUT API for users
    app.put('/users', async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(filter, updateDoc, options);
      res.json(result);
    });

    app.put('/users/admin', verifyToken, async (req, res) => {
      const user = req.body;
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({ email: requester });
        if (requesterAccount.role === 'admin') {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: 'admin' } }
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      }
      else {
        res.status(403).json({ message: 'You do not have access to make admin!!' });
      }
    })

    // for STRIPE payment gateway
    app.post('/create-payment-intent', async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.json({ clientSecret: paymentIntent.client_secret })
    })
  }
  finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello Doctors Portal!')
})
app.listen(port, () => {
  console.log(`listening at ${port}`)
})