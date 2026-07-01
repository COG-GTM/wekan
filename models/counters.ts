import { Mongo } from 'meteor/mongo';

const Counters = new Mongo.Collection<CounterDocument>('counters');

async function incrementCounterAsync(counterName: string, amount = 1) {
  // findOneAndUpdate's result shape is mongodb-driver-version dependent (older
  // drivers wrap the document in a ModifyResult `.value`, newer ones return the
  // document directly); typed through the documented interop alias so both
  // branches below type-check.
  const result: WekanDocumentField = await Counters.rawCollection().findOneAndUpdate(
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

interface CounterDocument {
  _id?: string;
  next_val?: number;
  // Counters are keyed by an arbitrary name; other fields are dynamic.
  [field: string]: WekanDocumentField;
}
