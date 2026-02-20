import 'dotenv/config';
import 'reflect-metadata';

import express from 'express';
import cors from 'cors';
import pg from 'pg';

import { RequestContext } from '@mikro-orm/core';
import { toNodeHandler } from 'better-auth/node';

import { getOrm } from '@/db/orm';
import { auth } from '@/features/auth/client';

import usersRoutes from '@/features/auth/users/routes';
import error from '@/shared/middleware/error';

const { types } = pg;
types.setTypeParser(types.builtins.NUMERIC, (value) =>
  Number.parseFloat(value)
);

const app = express();
const PORT = Number(process.env.PORT ?? 5000);

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);


// --- Stripe webhook MUST stay raw ---
// app.post(
//   '/api/auth/stripe/webhook',
//   express.raw({ type: 'application/json' }),
//   handleStripeWebhook
// );

app.use(express.json());

const orm = await getOrm();

app.use((req, _res, next) => {
  RequestContext.create(orm.em, next);
});

app.all('/api/auth/*path', toNodeHandler(auth));

app.use('/api/users', usersRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(error);

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});

