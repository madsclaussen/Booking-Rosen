import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { logger } from "@hono/hono/logger";
import postgres from "postgres";

const app = new Hono();

const sql = postgres();

app.use("/*", cors());
app.use("/*", logger());

// retrieve studio name by id
app.get("/api/studios/:id", async (c) => {
  const id = c.req.param("id");
  const studios = await sql`SELECT * FROM studios WHERE id = ${id}`;
  if (studios.length > 0) {
    return c.json(studios[0]);
  } else {
    return c.json({ error: "Studio not found" }, 404);
  }
});

// retrieve all customers
app.get("/api/customers", async (c) => {
  const customers = await sql`SELECT * FROM customers ORDER BY id ASC`;
  return c.json(customers);
});

// retrieve all bookings for a studio
app.get("/api/bookings/:studioId", async (c) => {
  const studioId = c.req.param("studioId");

  // The JOIN grabs the name from the customers table and attaches it to the booking
  const bookings = await sql`
        SELECT bookings.*, customers.name AS customer_name 
        FROM bookings
        JOIN customers ON bookings.customer_id = customers.id
        WHERE bookings.studio_id = ${studioId}
    `;

  return c.json(bookings);
});

// add a booking to the booking database
app.post("/api/addbooking", async (c) => {
  const { studioId, customerId, start, end } = await c.req.json();

  // Use the exact column names from your database: start_time and end_time
  const newBooking = await sql`
    INSERT INTO bookings (studio_id, customer_id, start_time, end_time) 
    VALUES (${studioId}, ${customerId}, ${start}, ${end})
    RETURNING *
  `;

  return c.json(newBooking);
});

// Update an existing booking
app.put("/api/bookings/:id", async (c) => {
  const id = c.req.param("id");
  const { customerId, start, end, description } = await c.req.json();

  try {
    await sql`
            UPDATE bookings 
            SET customer_id = ${customerId}, start_time = ${start}, end_time = ${end}, description = ${description}
            WHERE id = ${id}
        `;
    return c.json({ success: true, message: "Booking updated" });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Failed to update booking" }, 500);
  }
});


export default app;