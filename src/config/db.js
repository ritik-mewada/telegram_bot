import mongoose from "mongoose";

export default () => {
  return mongoose
    .connect(process.env.MONGO_CONNECTION_STRING)
    .then(() => console.log("Database Connected."));
};
