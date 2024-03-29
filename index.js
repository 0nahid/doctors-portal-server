const express = require('express')
const app = express()
const port = process.env.PORT || 5500;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


// console.log(process.env) 

// cors && middleware
app.use(express.json())
const cors = require('cors')
app.use(cors())



// verify jwt token
function verifyToken(req, res, next) {
  const authorization = req.headers?.authorization;
  // console.log(authorization);
  if (!authorization) {
    return res.status(403).send({ success: false, message: 'Forbidden Access' });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ success: false, message: 'Unauthorized access' });
    }
    req.decoded = decoded;
    // console.log(decoded);
    next();
  });
}

// nodemailer 

const options = {
  auth: {
    api_key: process.env.EMAIL_SENDER_KEY
  }
}
const emailClient = nodemailer.createTransport(sgTransport(options));

function sendAppointmentEmail(booking) {
  const { name, email: mail, formattedDate, price, slot, userName } = booking;
  const email = {
    from: process.env.EMAIL_SENDER,
    to: mail,
    subject: `Appointment Confirmation - ${formattedDate} for ${name}`,
    text: `Hi ${userName},\n\nThank you for booking an appointment with us.\n\nYour appointment is scheduled for ${formattedDate} at ${slot} for ${price}$`,
    html: `
    <p>Hi ${userName},</p>
    <p>Thank you for booking an appointment with us.</p>
    <p>Your appointment is scheduled for ${formattedDate} at ${slot} for ${price}$</p>
    <p>Regards,</p>
    <p>${process.env.EMAIL_SENDER}</p>
    `
  };

  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    }
    else {
      console.log(info);
    }
  });

}

// connect mongo 

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jl8yo.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
async function connect() {
  await client.connect() ? console.log('connected') : console.log('not connected')

  // collections 
  const servicesCollection = client.db('doctorsPortal').collection('services');
  const appointmentsCollection = client.db('doctorsPortal').collection('bookings');
  const usersCollection = client.db('doctorsPortal').collection('users');
  const doctorsCollection = client.db('doctorsPortal').collection('doctors');
  const paymentDetailsCollection = client.db('doctorsPortal').collection('paymentDetails');


  // verify admin
  const verifyAdmin = async (req, res, next) => {
    const requester = req.decoded.email;
    const requesterAccount = await usersCollection.findOne({ email: requester });
    // console.log(requesterAccount);
    if (requesterAccount.role === 'admin') {
      next();
    }
    else {
      return res.status(403).send({ success: false, message: 'Forbidden Access' });
    }
  }

  // get api
  app.get('/api/services', async (req, res) => {
    const services = await servicesCollection.find({}).project({ name: 1 }).toArray();
    res.send(services);
  })

  // appointment post api
  app.post('/api/bookings', async (req, res) => {
    const booking = req.body;
    const query = { treatment: booking.treatment, formattedDate: booking.formattedDate, userName: booking.userName }
    const exists = await appointmentsCollection.findOne(query);
    if (exists) {
      return res.send({ success: false, booking: exists })
    }
    sendAppointmentEmail(booking)
    const result = await appointmentsCollection.insertOne(booking);
    console.log(`sending email to ${booking.email}`);
    return res.send({ success: true, result });
  })
  // appointment get api
  app.get('/api/bookings', verifyToken, async (req, res) => {
    const email = req.query.email;
    const decodedEmail = req.decoded.email;
    if (email === decodedEmail) {
      const query = { email: email }
      const appointments = await appointmentsCollection.find(query).toArray();
      res.send(appointments);
    }
    else {
      res.send({ success: false, message: 'Unauthorized access' });
    }
  })

  // single appointment get api
  app.get('/api/bookings/:id', verifyToken, async (req, res) => {
    const id = req.params.id;
    const appointment = await appointmentsCollection.findOne({ _id: ObjectId(id) });
    res.send(appointment);
  })

  // patch api
  app.patch('/api/bookings/:id', verifyToken, async (req, res) => {
    const id = req.params.id;
    const payment = req.body;
    const result = await appointmentsCollection.updateOne({ _id: ObjectId(id) }, { $set: { paid: true, transactionId: payment.transactionId } });
    const paymentDetails = await paymentDetailsCollection.insertOne(payment);
    res.send(result);
  })

  // user put api
  app.put('/api/user/:email', async (req, res) => {
    const email = req.params.email;
    const user = req.body;
    const filter = { email: email };
    const options = { upsert: true };
    const updateDoc = {
      $set: user,
    };
    const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
    const result = await usersCollection.updateOne(filter, updateDoc, options);
    res.send({ result, token });
  })


  // admin put api
  app.put('/user/admin/:email', verifyToken, verifyAdmin, async (req, res) => {
    const email = req.params.email;
    const requester = req.decoded.email;
    const requesterAccount = await usersCollection.findOne({ email: requester });
    const filter = { email: email };
    const updateDoc = { $set: { role: 'admin' } };
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
  })

  // admin get api
  app.get('/admin/:email', async (req, res) => {
    const email = req.params.email;
    const user = await usersCollection.findOne({ email: email });
    const isAdmin = user?.role === 'admin';
    // console.log(isAdmin);
    res.send({ admin: isAdmin })
  })

  // app.get('/api/admin', verifyToken,async (req, res) => {
  //   const admin = await usersCollection.find({ role: 'admin' }).toArray();
  //   res.send(admin);
  // })

  // users get api 
  app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
    const users = await usersCollection.find({}).toArray();
    res.send(users);
  })


  // available services
  // app.get('/api/services/:date', async (req, res) => {
  //   const date = req.params.date;
  //   const services = await servicesCollection.find({ formattedDate: date }).toArray();
  //   res.send(services);
  // })


  app.get('/api/available', async (req, res) => {
    const date = req.query.date;
    // console.log(date);
    // step 1:  get all services
    const services = await servicesCollection.find().toArray();
    // step 2:  get all appointments 
    const query = { formattedDate: date };
    const bookings = await appointmentsCollection.find(query).toArray();
    // step 3: for each service
    services.forEach(service => {
      // step 4: find bookings for that service. output: [{}, {}, {}, {}]
      const serviceBookings = bookings.filter(book => book?.name === service?.name);

      // step 5: select slots for the service Bookings: ['', '', '', '']
      const bookedSlots = serviceBookings.map(book => book?.slot);
      // console.log(bookedSlots);
      // step 6: select those slots that are not in bookedSlots
      const availableSlots = service.slots.filter(slot => !bookedSlots.includes(slot));
      // console.log(availableSlots);
      service.slots = availableSlots;

    });

    res.send(services);
  })

  // doctors get api
  app.get('/api/doctors', verifyToken, verifyAdmin, async (req, res) => {
    const doctors = await doctorsCollection.find({}).toArray();
    res.send(doctors);
  })

  // doctors post api
  app.post('/api/doctors', verifyToken, verifyAdmin, async (req, res) => {
    const doctor = req.body;
    const result = await doctorsCollection.insertOne(doctor);
    res.send(result);
  })

  // doctors delete api
  app.delete('/api/doctors/:mail', verifyToken, verifyAdmin, async (req, res) => {
    const mail = req.params.mail;
    const result = await doctorsCollection.deleteOne({ mail: mail });
    res.send(result);
  })

  // // payment details post api
  // app.post('/api/booking/payment/:id', async (req, res) => {
  //   const id = req.params.id;
  //   const payment = req.body;
  //   console.log(payment);
  //   const result = await paymentDetailsCollection.insertOne({ ...payment, bookingId: id });
  //   res.send(result);
  // })
  // // get api 
  // app.get('/api/booking/payment/:id', async (req, res) => {
  //   const id = req.params.id;
  //   const payment = await paymentDetailsCollection.findOne({ bookingId: id });
  //   res.send(payment);
  // })
  // // get api
  // app.get('/api/booking/payment', async (req, res) => {
  //   const payment = await paymentDetailsCollection.find({}).toArray();
  //   res.send(payment);
  // })

  // create payment intent
  app.post('/create-payment-intent', verifyToken, async (req, res) => {
    const { price } = req.body;
    const amount = price * 100;
    // console.log(amount);
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card']
    });
    res.send({ clientSecret: paymentIntent.client_secret })
  });


}
connect().catch(console.dir);


app.get('/', (req, res) => res.send('Welcome to Doctors portal api!'))
app.listen(port, () => console.log(`Server is listening on port ${port}!`))