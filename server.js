import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import OpenAI from "openai";
import userModel from "./src/models/User.js";
import eventModel from "./src/models/Event.js";
import connectDb from "./src/config/db.js";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const openai = new OpenAI({
  apiKey: process.env["OPENAI_KEY"],
});

try {
  connectDb();
} catch (error) {
  console.log(error);
  process.kill(process.pid, "SIGTERM");
}

bot.start(async (ctx) => {
  const from = ctx.update.message.from;

  try {
    await userModel.findOneAndUpdate(
      {
        tgId: from.id,
      },
      {
        $setOnInsert: {
          firstName: from.first_name,
          lastName: from.last_name,
          isBot: from.is_bot,
          username: from.username,
        },
      },
      {
        upsert: true,
        new: true,
      }
    );
    await ctx.reply(
      `Hey! ${from.first_name}, Welcome. I will be writing highly engaging social media for you 🚀 Just keep feeding me with the events throughout the day. Let's shine on social media.`
    );
  } catch (error) {
    console.log(error);
    await ctx.reply("Facing Difficulties!");
  }
  console.log("Welcome to Heancher's bot");
});

bot.help((ctx) => {
  ctx.reply("For Support Contact Google.com");
});

bot.command("generate", async (ctx) => {
  const from = ctx.update.message.from;

  const { message_id: waitingMessageId } = await ctx.reply(
    `Hey ${from.first_name}, kindly wait for a moment. I am curating posts for you 🚀⏳.`
  );
  const { message_id: stickerWaitingId } = await ctx.replyWithSticker(
    "CAACAgIAAxkBAAMvZgyQ7m2iWGQRXoc3Jx5yeR5Fat8AAl4SAALsmSlJfO_ZpUf3ZDs0BA"
  );

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const events = await eventModel.find({
    tgId: from.id,
    createdAt: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  if (events.length === 0) {
    await ctx.deleteMessage(waitingMessageId);
    await ctx.deleteMessage(stickerWaitingId);
    await ctx.reply("No events for the day.");
    return;
  }

  // open ai call
  try {
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Act as a senior copywriter, you write highly engaging posts for linkedin, facebook and twitter using provided thoughts/events throught the day.",
        },
        {
          role: "user",
          content: `
            Write like a human, for humans. Craft three engaging social media posts tailored for linkeIn, Facebook, and Twitter audiences. Use simple language. Use give time labels just to understand the order of the event, don't mention the time in the posts. Each post should creatively highlight the following events. Ensure the tone is conversational and impactful. Focus on engaging the respective plateform's audiance, encouraging interaction, and driving interest in the events: 
            ${events.map((event) => event.text).join(", ")}
          `,
        },
      ],
      model: process.env.OPENAI_MODEL,
    });
    await userModel.findOneAndUpdate(
      {
        tgId: from.id,
      },
      {
        $inc: {
          promptTokens: chatCompletion.usage.prompt_tokens,
          completionTokens: chatCompletion.usage.completion_tokens,
        },
      }
    );

    await ctx.deleteMessage(waitingMessageId);
    await ctx.deleteMessage(stickerWaitingId);
    await ctx.reply(chatCompletion.choices[0].message.content);
  } catch (error) {
    console.log("Facing Difficulties!", error);
    await ctx.deleteMessage(waitingMessageId);
    await ctx.deleteMessage(stickerWaitingId);
    await ctx.reply(
      `${error.error.message.split(".")[0]} 😞. PLEASE TRY AGAIN LATER!`
    );
  }
});

bot.on(message("text"), async (ctx) => {
  const from = ctx.update.message.from;
  const message = ctx.update.message.text;

  try {
    await eventModel.create({
      text: message,
      tgId: from.id,
    });
    await ctx.reply(
      "Noted 👍, Keep texting me your thoughts. To generate the posts, just enter the command: /generate"
    );
  } catch (error) {
    console.log(error);
    await ctx.reply("Facing Difficulties, please try again later.");
  }
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
