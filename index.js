const express = require('express')
const app = express()
const port = process.env.PORT || 5500

require('dotenv').config()
// console.log(process.env) 

// cors && middleware
app.use(express.json())
const cors = require('cors')
app.use(cors())

// connect mongo 

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jl8yo.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
async function connect() {
  await client.connect() ? console.log('connected') : console.log('not connected')
  // collections 
  const servicesCollection = client.db('doctorsPortal').collection('services');
  const appointmentsCollection = client.db('doctorsPortal').collection('bookings');

  // get api
  app.get('/api/services', async (req, res) => {
    const services = await servicesCollection.find({}).toArray();
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
    const result = await appointmentsCollection.insertOne(booking);
    return res.send({ success: true, result });
  })
  // appointment get api
  app.get('/api/bookings', async (req, res) => {
    const email = req.query.email;
    const query = { email: email }
    const appointments = await appointmentsCollection.find(query).toArray();
    res.send(appointments);
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
}
connect().catch(console.dir);


app.get('/', (req, res) => res.send('Hello World!'))
app.listen(port, () => console.log(`Example app listening on port ${port}!`))