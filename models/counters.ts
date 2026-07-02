import { Mongo } from 'meteor/mongo';

const Counters = new Mongo.Collection('counters');

async function incrementCounterAsync(counterName: string, amount = 1) {
  // The mongodb driver's findOneAndUpdate return shape varies across versions
  // (ModifyResult vs. the document directly), so read it through `any`.
  const result: any = await Counters.rawCollection().findOneAndUpdate(
    { _id: counterName },
    { $inc: { next_val: amount } },
    { upsert: true, returnDocument: 'after' },
  );
  return result.value ? result.value.next_val : result.next_val;
}

// Alias for backward compatibility — all callers should use the async version
const incrementCounter = incrementCounterAsync;

export { Counters, incrementCounter, incrementCounterAsync };
export default Counters;
