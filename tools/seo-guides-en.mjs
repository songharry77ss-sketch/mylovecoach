/**
 * 영어 상황별 문자 가이드 (세계 출시, 2026-11-28~) — 검색에서 자주 찾는 고민마다 정적 페이지 하나 (/en/guide/<slug>).
 * tools/seo-global.mjs 가 빌드 때 HTML·sitemap 으로 만든다. 쓰는 법·다른 언어 추가는 docs/GLOBAL_SEO.md.
 *
 * 원칙 (한국어 가이드 tools/seo-guides.mjs 와 같다)
 *  - 사람이 읽고 바로 써먹을 수 있게: 상황 읽는 법 → 보낼 문장 예시(왜 통하는지) → 피할 말 → 자주 묻는 질문.
 *  - 상대를 조종하거나 거절을 무시하라는 조언(픽업 아티스트식 기술·네깅·떠보기)은 넣지 않는다 — 스토어 설명의 「건강한 연애」 약속.
 *  - 지어낸 숫자·통계·후기를 넣지 않는다. 앱 기능은 스토어 문구(docs/STORE_LISTING_EN.md)에 있는 것만 말한다.
 *  - 본문 600~1000 단어 (tools/seo-global.test.mjs 가 센다).
 *
 * 형식: sections[].body 의 문자열은 문단, { ul }·{ ol } 은 목록, { ex } 는 예시 문장 카드({ tone, text, why }).
 * 문장 안의 [글자](/en/guide/<slug>) 는 링크, **글자** 는 굵게 바뀐다. q 는 웹 앱 입력칸에 미리 채울 상황(200자 이내).
 */
export const GUIDES_EN = [
  {
    slug: 'left-on-read',
    title: `Left on Read? What to Text (and When to Wait)`,
    h1: `Left on read: what to text, and when to just wait`,
    description: `Got left on read? How to tell what it means, how long to wait, low-pressure follow-up texts you can copy, and when it's time to let it go.`,
    intro: [
      `You sent the text. It says Read. Then… nothing. Few things make a phone feel heavier. Before you spiral or fire off a second message, remember that "read" only tells you the message was opened — not that it was judged, rejected, or ignored on purpose.`,
      `People open texts in line at the store, between meetings, or half-asleep, and plan to reply "later" — and later quietly turns into tomorrow. This guide walks you through reading the situation, waiting a reasonable amount of time, and sending one easy follow-up that doesn't put them on the spot.`,
    ],
    sections: [
      {
        h: `First, look at where the conversation stopped`,
        body: [
          `Scroll up and check the last few messages before you decide what the silence means.`,
          {
            ul: [
              `**Did your last message need a reply?** "Haha true" or a meme often ends a thread naturally. That's not really being left on read — the conversation just paused.`,
              `**Was it a big question?** "So what are we?" or a date invite can take people time to answer, especially if they're unsure what to say.`,
              `**What's their normal pace?** Someone who usually replies in five minutes going quiet for a day is different from someone who always takes a while.`,
              `**What time was it?** Messages opened during work, class, or late at night are the ones most likely to be forgotten.`,
            ],
          },
        ],
      },
      {
        h: `How long to wait before texting again`,
        body: [
          `There's no magic number. A useful rule: wait at least as long as their usual reply time — often a day or two — before following up once. Waiting isn't a game. It just gives them room to reply on their own, and it keeps your follow-up from reading like pressure.`,
          `If they replied regularly before and this is a one-off, a single light message after a day is completely normal. If you've already followed up once and still heard nothing, the kindest move for both of you is to step back.`,
        ],
      },
      {
        h: `What to send: easy follow-ups`,
        body: [
          `The best follow-up usually doesn't mention the silence at all. Start a new, easy thread they can answer in five seconds.`,
          {
            ex: [
              { tone: `Casual`, text: `Ok I finally tried that ramen place you told me about. You were right, the spicy one is unreal`, why: `It references something they shared and gives them an easy way back in, with no guilt attached.` },
              { tone: `Playful`, text: `Not me checking if my last text got lost in the void 😅 no rush, hope your week's going ok`, why: `It names the moment lightly and immediately takes the pressure off with "no rush."` },
              { tone: `Sincere`, text: `Hey, I know things get busy. I liked talking with you — text me whenever you've got a minute.`, why: `It says the honest thing once, then hands the next move to them.` },
              { tone: `If you asked them out`, text: `No pressure on Saturday btw — if it doesn't work, totally fine. Would still love to hang sometime.`, why: `Making it easy to say no or suggest another time is often exactly what was missing.` },
            ],
          },
        ],
      },
      {
        h: `What not to send`,
        body: [
          {
            ul: [
              `"Why are you ignoring me?" or "I can see you read it." Accusations make replying feel like walking into an argument.`,
              `Several messages in a row, or the same question again in different words.`,
              `Passive tests like "guess you're busy 🙃" or "nvm." They ask the other person to manage your feelings.`,
              `Bringing up their social media ("you had time to post a story though").`,
            ],
          },
        ],
      },
      {
        h: `When to let it go`,
        body: [
          `If you've followed up once and a few days pass with nothing, take that as your answer for now. It might be bad timing, or they might not be as interested — either way, more texts won't change it. Leaving the door open with grace is far more attractive than chasing, and it lets you put your energy into people who show up for the conversation.`,
          `If you're not sure whether to send that second message at all, our [double texting guide](/en/guide/double-texting) covers timing in more detail.`,
        ],
      },
    ],
    faq: [
      { q: `How long should I wait after being left on read?`, a: `Usually a day or two, or at least as long as their normal reply time. Then send one easy, new message. If that also goes unanswered, give them space.` },
      { q: `Does being left on read mean they're not interested?`, a: `Not necessarily. People open messages and forget, or put off replying because they don't know what to say. A repeated pattern, especially if they never start conversations, is worth paying attention to.` },
      { q: `Should I double text after being left on read?`, a: `One friendly follow-up is fine. More than that usually adds pressure.` },
    ],
    q: `They left me on read yesterday. Should I text again? What should I say?`,
  },
  {
    slug: 'haha-maybe-reply',
    title: `How to Reply to "Haha Maybe" (Without Sounding Pushy)`,
    h1: `How to reply to "haha maybe"`,
    description: `Asked someone out and got "haha maybe"? What it can mean, replies that make a yes easy (and a no easy too), and what to do if it stays a maybe.`,
    intro: [
      `"Haha maybe" might be the most stressful two words in texting. It's not a yes, it's not a no, and the "haha" makes it impossible to read. Did they love the idea and play it cool? Are they letting you down gently? Is their schedule just a mess?`,
      `The good news: you don't need to decode it perfectly. You need a reply that makes it easy for them to say yes if they want to — and just as easy to say no. That's what actually gets you a clear answer.`,
    ],
    sections: [
      {
        h: `What "haha maybe" usually means`,
        body: [
          `Context matters more than the words. Look at the rest of the chat:`,
          {
            ul: [
              `**Flirty maybe:** they've been engaged, asking questions, using emojis like 👀 or 😏. Often it means "convince me a little" or "I'm in, but I'm not going to sound too eager."`,
              `**Logistics maybe:** your invite was vague ("we should hang sometime"). They might like the idea but have nothing concrete to say yes to.`,
              `**Soft no:** short replies, no questions back, slow responses for a while. Some people say maybe because a direct no feels rude.`,
            ],
          },
          `You can't always tell which one it is — and you don't have to. The replies below work for all three.`,
        ],
      },
      {
        h: `Replies that make the next step easy`,
        body: [
          `The trick is to turn a vague maybe into a specific, low-pressure plan. A concrete time and place is much easier to say yes to than "sometime."`,
          {
            ex: [
              { tone: `Playful`, text: `"Maybe" is my favorite kind of yes. Saturday afternoon, that taco place you mentioned?`, why: `It keeps the light tone, reads the maybe generously, and offers one specific plan.` },
              { tone: `Natural`, text: `Haha fair. If Saturday works I'm down for coffee — if not, no worries at all`, why: `A concrete suggestion plus a built-in exit. Nobody feels cornered.` },
              { tone: `Confident`, text: `I'll take that as a strong maybe 😌 let me know if you're free this week, I'd like to see you`, why: `It's honest about your interest and leaves the next move in their hands.` },
              { tone: `When your invite was vague`, text: `Ok let me make it less vague: Thursday, 7pm, that bar with the trivia night. In or out?`, why: `It gives them a real choice instead of a hypothetical one, and "in or out" makes a no feel allowed.` },
            ],
          },
        ],
      },
      {
        h: `What to do if they stay a maybe`,
        body: [
          `If you've offered a specific plan and they answer with another maybe, a "we'll see," or no counter-suggestion, it's okay to step back. A good last line leaves the door open without asking again:`,
          {
            ex: [
              { tone: `Leaving the door open`, text: `All good! If you're ever up for it, you know where to find me 🙂`, why: `Friendly, not hurt — and it means the next invite comes from them.` },
            ],
          },
          `People who say maybe because they're genuinely busy will usually suggest another time themselves. If they don't, that's information too — and you've kept your dignity and the friendship.`,
        ],
      },
      {
        h: `Avoid these`,
        body: [
          {
            ul: [
              `"Is that a yes or a no?" Demanding a clear answer right away makes it awkward to give one.`,
              `Re-asking the same invite again and again, or adding guilt ("I already told my friends we were going").`,
              `Over-reading the emoji. A 👀 is a good sign, not a promise.`,
              `Going cold or sarcastic ("k") because it wasn't an instant yes.`,
            ],
          },
          `If you haven't actually asked yet, start with our guide on [how to ask someone out over text](/en/guide/ask-someone-out-over-text).`,
        ],
      },
    ],
    faq: [
      { q: `Is "haha maybe" a no?`, a: `Not always. It can be flirty, a scheduling issue, or a polite no. Offer one specific, easy plan; how they respond to that tells you much more than the maybe itself.` },
      { q: `Should I ask again later?`, a: `If they stayed vague after a concrete plan, let them make the next move. If they said maybe because of timing and suggested another day, follow up on that day.` },
      { q: `What if they reply "maybe" without the haha?`, a: `Same approach, but read the rest of the conversation. A flat "maybe" after a run of short replies is more likely a soft no.` },
    ],
    q: `I asked them out and they replied "haha maybe". What do I say back?`,
  },
  {
    slug: 'double-texting',
    title: `Double Texting Rules: When It's Fine and When to Wait`,
    h1: `Double texting rules: when it's fine, and when to wait`,
    description: `Is double texting bad? When a second text is totally normal, when it starts to feel like pressure, how long to wait, and double texts you can actually send.`,
    intro: [
      `Double texting — sending another message before they've replied to your last one — has a weirdly bad reputation. Plenty of people treat it like a rule you must never break. In real life, people double text all the time, and it's usually fine.`,
      `What matters isn't the number of bubbles. It's what the second message asks of the other person. A new, easy thought feels relaxed. A follow-up that really means "why haven't you answered?" feels like pressure. Here's how to tell the difference.`,
    ],
    sections: [
      {
        h: `When double texting is totally fine`,
        body: [
          {
            ul: [
              `You thought of something new: something funny happened, you saw something that reminded you of them, or you have a real update.`,
              `You're fixing or adding to your own message ("*Friday, not Thursday" or "also, bring a jacket").`,
              `You're in an easy back-and-forth and they're just a slower texter than you.`,
              `It's been a day or two and you're starting a fresh topic, not chasing the old one.`,
            ],
          },
        ],
      },
      {
        h: `When to hold off`,
        body: [
          {
            ul: [
              `Your last message was a big question (an invite, "how do you feel about us?") and they haven't answered yet. Give them time to think.`,
              `It would be your third or fourth message in a row with no reply in between.`,
              `The second text is really about the silence: "??", "hello?", "did you see my message".`,
              `You're upset. Write it in your notes app first and send it tomorrow if you still want to.`,
            ],
          },
        ],
      },
      {
        h: `How long to wait`,
        body: [
          `A practical rule: if you're adding something small and related, right away is fine. If you're following up after no reply, wait at least as long as their usual reply time — often a day — and switch to a new, easy topic. If they're normally quick and suddenly slow, they're most likely busy, not ignoring you.`,
          `One follow-up is normal. If that one also goes unanswered, the ball is in their court. Not getting a reply after two attempts is an answer for now, and respecting it says a lot about you. (More on that in [what to text when you're left on read](/en/guide/left-on-read).)`,
        ],
      },
      {
        h: `Double texts that work`,
        body: [
          {
            ex: [
              { tone: `New topic`, text: `Ok random but I just saw a dog wearing a tiny raincoat and thought you'd appreciate it 🐶`, why: `Light, fun, and it needs no reply about the earlier message.` },
              { tone: `Low-pressure check-in`, text: `Hope your week's not too crazy! Still thinking about that show you recommended — I'm 3 episodes in`, why: `Warm, gives them something easy to reply to, and carries no guilt.` },
              { tone: `Following up on a plan`, text: `Hey, just checking if Friday still works for you — totally fine if not, we can find another time`, why: `Plans genuinely need answers. This asks once and offers an easy out.` },
              { tone: `Owning it with humor`, text: `Double texting because I'm confident like that 😌 how did the interview go?`, why: `Self-aware humor plus a real question about their life.` },
            ],
          },
        ],
      },
      {
        h: `If they reply after your double text`,
        body: [
          `Great — just pick up the conversation normally. There's no need to point out that they took a while, or to apologize for texting twice. If they apologize for the slow reply, keep it easy:`,
          {
            ex: [
              { tone: `Keeping it easy`, text: `Haha no worries at all! So how was the trip?`, why: `It lets them off the hook instantly and gets straight back to the fun part.` },
            ],
          },
        ],
      },
      {
        h: `What to skip`,
        body: [
          {
            ul: [
              `"??" or "hellooo" with nothing else.`,
              `Re-sending the same question.`,
              `Long paragraphs explaining why you're texting again.`,
              `Comments about their activity elsewhere ("I see you're online").`,
            ],
          },
          `The short version: double text to share, not to chase. If your second message would be fun to receive on its own, send it. If it only exists to get a reply to the first one, wait.`,
        ],
      },
    ],
    faq: [
      { q: `Is double texting bad?`, a: `No. Double texting with a new, easy message is normal. What feels bad is a string of messages that pressure someone to respond.` },
      { q: `Is it ok to double text a crush?`, a: `Yes, once, with something light. If they reply warmly, great. If two messages go unanswered, give them space.` },
      { q: `Is triple texting ever ok?`, a: `In an active, back-and-forth chat, sure. After two unanswered messages, it's better to wait for them.` },
    ],
    q: `I texted them yesterday and got no reply. Is it ok to double text? What should I send?`,
  },
  {
    slug: 'ask-someone-out-over-text',
    title: `How to Ask Someone Out Over Text (Examples That Work)`,
    h1: `How to ask someone out over text`,
    description: `How to ask someone out over text without it being awkward: when to ask, how to make it specific and easy to answer, examples to copy, and how to take a no.`,
    intro: [
      `Asking someone out over text is easier than doing it in person in one way — you get to take your time writing it — and harder in another, because you can't see their face. The good news is that a clear, specific, easygoing invite is usually the best version of the question.`,
      `Here's how to pick the moment, what to actually say, and how to respond whatever they answer.`,
    ],
    sections: [
      {
        h: `Pick the moment`,
        body: [
          {
            ul: [
              `Ask when the conversation is going well — they're replying, asking you things, joking around. Not right after a long silence.`,
              `Use something from your chat as the reason. If they mentioned a movie, a food, a show, or a place, that's your invite.`,
              `Don't wait forever. Weeks of texting with no plan can make things fizzle. If you're enjoying the conversation, it's normal to suggest meeting.`,
            ],
          },
        ],
      },
      {
        h: `Make it specific, easy, and optional`,
        body: [
          `Vague invites ("we should hang out sometime") are easy to say yes to and rarely happen. A good invite has three parts:`,
          {
            ol: [
              `**A specific idea:** coffee, a walk, a show, that taco place.`,
              `**A rough time:** "this weekend," "Thursday evening."`,
              `**An easy way to say no** or suggest something else.`,
            ],
          },
          `Keep a first date simple and short — coffee, a drink, a walk. It's lower pressure for both of you, and you can always stay longer if it's going great.`,
        ],
      },
      {
        h: `Examples you can send`,
        body: [
          {
            ex: [
              { tone: `Using something they said`, text: `You keep talking about that dumpling place and now I need to try it. Want to go this weekend?`, why: `The reason is built in, and it shows you were listening.` },
              { tone: `Straightforward`, text: `I really like talking to you. Would you want to get coffee sometime this week?`, why: `Honest and clear, with no guessing. Confidence often just means saying it plainly.` },
              { tone: `Playful`, text: `Ok, settling this debate in person: best pizza in town, Saturday? Loser buys`, why: `It turns an inside joke into a plan and keeps things light.` },
              { tone: `Low key`, text: `I'm going to that free concert in the park on Sunday — want to come?`, why: `Joining a plan that's happening anyway feels low pressure.` },
              { tone: `With an easy exit`, text: `Would you want to grab a drink Friday? No worries if you're busy — just thought I'd ask`, why: `Signaling that a no is fine makes a yes easier, too.` },
            ],
          },
        ],
      },
      {
        h: `If you met on a dating app`,
        body: [
          `On apps, plenty of matches fade simply because nobody suggests meeting. Once you've had a good exchange or two — you're both asking questions and the replies feel easy — it's reasonable to suggest a short first meeting. A video call, or a quick coffee somewhere public, is a comfortable first step for many people.`,
          `Let them pick the time if they prefer, and don't take it personally if they'd like to chat a bit longer first. Everyone has a different comfort level with meeting someone new, and respecting that is part of making a good first impression.`,
        ],
      },
      {
        h: `How to handle the answer`,
        body: [
          {
            ul: [
              `**Yes:** lock in the details soon (day, time, place) and keep the chat light until then. There's no need to text non-stop before the date.`,
              `**Maybe, or "I'm busy that day":** if they suggest another time, great. If not, offering one more specific option is fine — then let them come back to you. (See [how to reply to "haha maybe"](/en/guide/haha-maybe-reply).)`,
              `**No:** take it gracefully. "No worries at all, glad we got to chat!" A kind reaction keeps things friendly, and it's simply the right thing to do. Don't argue or ask them to justify it.`,
            ],
          },
        ],
      },
      {
        h: `Avoid these`,
        body: [
          {
            ul: [
              `Asking in a long paragraph with a speech about your feelings before you've even met.`,
              `Turning it into a test ("you probably wouldn't want to, but…").`,
              `Pushing after a clear no, or asking repeatedly.`,
              `Planning something big and intense for a first date.`,
            ],
          },
          `If the date goes well, our guide on [what to text after a first date](/en/guide/text-after-first-date) covers the next step.`,
        ],
      },
    ],
    faq: [
      { q: `Is it ok to ask someone out over text?`, a: `Yes. It's how lots of people ask now, especially if you met online. Keep it specific and friendly.` },
      { q: `How soon should I ask someone out after we start texting?`, a: `When the conversation is clearly going well. There's no fixed timeline, but texting for weeks without a plan tends to fizzle.` },
      { q: `What if they say no?`, a: `Thank them and let it go. A gracious response keeps your self-respect — and often the friendship — intact.` },
    ],
    q: `I want to ask them out over text. How do I say it without being awkward?`,
  },
  {
    slug: 'dry-texter',
    title: `Dry Texter? How to Reply and Keep It Going (Examples)`,
    h1: `How to talk to a dry texter`,
    description: `Getting "lol", "nice" and one-word replies? How to tell a dry texter from someone who's not interested, replies that make talking easier, and when to stop trying.`,
    intro: [
      `"Lol." "Nice." "Yeah." Texting a dry texter can feel like playing tennis against a wall. You're putting in effort, they're sending back one word, and you start wondering if they even want to talk to you.`,
      `Sometimes they don't. But often, a dry texter is just someone who isn't a natural texter — they'd much rather talk in person or on the phone. Here's how to tell which one you're dealing with, and how to make the conversation easier for both of you.`,
    ],
    sections: [
      {
        h: `Dry texter, or not interested?`,
        body: [
          `The clue is in what they do, not how many words they use.`,
          {
            ul: [
              `**Probably just a dry texter:** they reply fairly consistently, sometimes start conversations, say yes to plans, and are warmer in person.`,
              `**Probably not that interested:** replies are slow and short, they never ask anything back, never start a chat, and dodge plans.`,
              `**Also check yourself:** if your messages are mostly "how was your day?", there's not much to grab onto. Generic questions get generic answers.`,
            ],
          },
        ],
      },
      {
        h: `Make it easy to reply`,
        body: [
          `Dry texters respond best to messages that are specific, fun, and easy. Some ideas:`,
          {
            ul: [
              `Ask either/or questions instead of open ones. "Beach or mountains?" is easier than "What do you like to do?"`,
              `Share something first, then ask. People tend to mirror the energy they get.`,
              `Send a photo, a meme, or a voice note — something that doesn't require a paragraph back.`,
              `Move to a call or a plan. If they're dry over text but fun in person, that's where the connection is.`,
            ],
          },
        ],
      },
      {
        h: `Replies to try`,
        body: [
          {
            ex: [
              { tone: `When they say "lol"`, text: `Ok rate my day from 1 to 10: I spilled coffee on my laptop but then found $20 in an old jacket`, why: `It gives them something specific and silly to react to.` },
              { tone: `Either/or`, text: `Important question: pineapple on pizza, yes or crime?`, why: `Low effort to answer, and easy to keep going from there.` },
              { tone: `Curious`, text: `You mentioned you climb — how did you get into that?`, why: `It asks about something they actually care about. People open up about their interests.` },
              { tone: `Moving offline`, text: `Honestly I feel like you're way funnier in person. Want to grab a coffee this week?`, why: `If texting isn't their thing, a plan might be.` },
              { tone: `Naming it lightly`, text: `I'm getting the feeling you're not a big texter 😄 totally fine — are you more of a call person?`, why: `Friendly and curious, not accusatory. It gives them a chance to say how they like to talk.` },
            ],
          },
        ],
      },
      {
        h: `What doesn't help`,
        body: [
          {
            ul: [
              `Matching their dryness to "teach them a lesson."`,
              `Calling them out: "why are you so boring over text?"`,
              `Writing longer and longer messages to make up for theirs.`,
              `Interview mode: question after question with nothing about you.`,
            ],
          },
          `For more ways to keep things flowing, see [how to keep a conversation going](/en/guide/keep-conversation-going).`,
        ],
      },
      {
        h: `What if you're the dry texter?`,
        body: [
          `If people often tell you you're hard to text, you don't need to become a different person. A few small habits go a long way: add one detail to your answer, ask one question back, and share something you noticed during your day. If texting just isn't your thing, say so — "I'm way better on the phone, can I call you later?" is honest and often welcome.`,
        ],
      },
      {
        h: `When to stop trying`,
        body: [
          `If you've made it easy — fun questions, sharing first, suggesting a plan — and they still never ask anything back or start a conversation, it's fair to pull back and see if they reach out. Interest usually shows up as effort in some form, even from people who hate texting. You deserve conversations that feel two-sided.`,
        ],
      },
    ],
    faq: [
      { q: `Does dry texting mean they're not interested?`, a: `Not always. Some people just don't enjoy texting. Look at whether they reply consistently, start conversations, and agree to plans.` },
      { q: `How do I make a conversation less dry?`, a: `Be specific, share something about yourself, ask either/or questions, and suggest a call or a meetup.` },
      { q: `Should I tell them they're a dry texter?`, a: `If you do, keep it light and curious rather than critical, and ask how they prefer to talk.` },
    ],
    q: `They only reply with one word like "lol" or "nice". How do I keep the conversation going?`,
  },
  {
    slug: 'keep-conversation-going',
    title: `How to Keep a Text Conversation Going (Without Forcing It)`,
    h1: `How to keep a text conversation going`,
    description: `Running out of things to say over text? Simple habits that keep a conversation going naturally, what to send when it stalls, and how to end on a good note.`,
    intro: [
      `Every conversation hits a lull. You answer their question, they say "haha yeah," and suddenly you're staring at the screen trying to think of something that isn't "so… what's up?"`,
      `Keeping a conversation going isn't about having a script. It's about giving the other person something easy and interesting to reply to — and knowing that it's okay to let a conversation rest, too.`,
    ],
    sections: [
      {
        h: `Four habits that keep chats alive`,
        body: [
          {
            ol: [
              `**Answer, then add.** Don't just reply to their question — add a detail or a question of your own. "Good! Finally finished that project, now I'm celebrating with takeout. What's your weekend looking like?"`,
              `**Pick up threads.** Notice what they mention in passing — a trip, a friend, a game, an exam — and ask about it later. Remembering details is one of the most attractive things you can do.`,
              `**Ask questions that are easy but not boring.** "What's the best thing you ate this week?" beats "How was your day?"`,
              `**Share something real.** A small story, a photo, an opinion. Conversations grow when both people give a little.`,
            ],
          },
        ],
      },
      {
        h: `When it stalls: things to send`,
        body: [
          {
            ex: [
              { tone: `Callback`, text: `Wait, how did the thing with your roommate's cat end up? I need closure`, why: `It picks up an earlier thread and shows you were paying attention.` },
              { tone: `Fun question`, text: `Ok, quick: if you could only eat one cuisine for a year, what are you picking?`, why: `Easy, playful, and you learn something about them.` },
              { tone: `Sharing first`, text: `Just had the most chaotic grocery run of my life. Your turn: what's the most random thing that happened to you today?`, why: `It opens with your story, then hands them the mic.` },
              { tone: `Honest and light`, text: `I'm officially out of smooth topics so here's a random one: what song have you had on repeat lately?`, why: `Admitting the lull with humor takes the pressure off both of you.` },
            ],
          },
        ],
      },
      {
        h: `Questions that go a bit deeper`,
        body: [
          `Once you're comfortable, slightly more personal questions make a conversation more memorable than another round of small talk. Keep them light, and be ready to answer them yourself:`,
          {
            ul: [
              `"What's something you're looking forward to this month?"`,
              `"What's a small thing that always makes your day better?"`,
              `"What were you obsessed with as a kid?"`,
              `"If you had a free Saturday with zero obligations, what would you do?"`,
            ],
          },
        ],
      },
      {
        h: `Read the energy`,
        body: [
          `A conversation is a two-person thing. If they're sending long, curious replies, keep going. If they're clearly busy — short answers, long gaps — that's not a sign you need better topics. It's a sign to pause. "Sounds like a crazy day, talk later!" is a perfectly good move, and it often makes the next conversation better.`,
          `If their replies are short all the time, not just today, our guide to [talking with a dry texter](/en/guide/dry-texter) may help.`,
        ],
      },
      {
        h: `Don't be afraid to end it`,
        body: [
          `Not every conversation needs to last all night. Ending while it's still fun is better than dragging it out until it fizzles — and it gives you something to pick up next time.`,
          {
            ex: [
              { tone: `A good ending`, text: `Ok I need to sleep but this was fun. Tell me how the presentation goes tomorrow!`, why: `It ends warm and gives you an easy reason to talk again.` },
            ],
          },
        ],
      },
      {
        h: `Common mistakes`,
        body: [
          {
            ul: [
              `Only asking questions — it starts to feel like an interview.`,
              `Only talking about yourself.`,
              `Answering with one word and hoping they carry it.`,
              `Forcing it when they're clearly busy or giving short replies.`,
            ],
          },
        ],
      },
    ],
    faq: [
      { q: `What do you text when the conversation dies?`, a: `Bring up something they mentioned earlier, ask a fun and specific question, or share a small story and ask for theirs. Or let it rest and start fresh later.` },
      { q: `How do I keep a conversation going with my crush?`, a: `Answer and add, remember details, and mix questions with your own stories. Once it's flowing, suggest meeting up.` },
      { q: `Is it bad to end a conversation first?`, a: `No. Ending on a high note is a good thing, and it makes it easy to pick up later.` },
    ],
    q: `Our conversation keeps dying. What should I text to keep it going?`,
  },
  {
    slug: 'signs-they-like-you-over-text',
    title: `Signs Your Crush Likes You Over Text (and What to Do)`,
    h1: `Is my crush interested? Signs over text`,
    description: `Signs someone is interested in you over text, mixed signals that don't mean much on their own, and a respectful way to find out where you stand.`,
    intro: [
      `Trying to figure out if someone likes you from their texts can feel like detective work. Every emoji, every reply time, every "haha" gets analyzed. And the truth is, texting only tells you part of the story.`,
      `Still, there are patterns that tend to show real interest. None of them is proof on its own — look for several together, over time.`,
    ],
    sections: [
      {
        h: `Signs they're likely interested`,
        body: [
          {
            ul: [
              `They start conversations, not just respond to yours.`,
              `They ask you questions back and follow up on things you told them.`,
              `They remember small details — your exam, your friend's name, the show you were watching.`,
              `Their replies are fairly consistent, even if not instant. Busy people who are interested still make time.`,
              `They match or build on your energy: longer messages, jokes, emojis similar to yours.`,
              `They suggest plans or say yes to yours, and when they can't make it, they offer another time.`,
              `There's playful teasing, compliments, or flirty emojis (😏, 👀, 😉) that feel directed at you.`,
            ],
          },
        ],
      },
      {
        h: `Mixed signals that don't mean much on their own`,
        body: [
          {
            ul: [
              `**Reply speed.** Some people are glued to their phones; others check twice a day. Compare to their normal pace, not yours.`,
              `**One short reply.** Everyone has busy days.`,
              `**Liking your posts or viewing your stories.** It's something, but it's low effort.`,
              `**Lots of emojis or "haha".** Some people text that way with everyone.`,
            ],
          },
        ],
      },
      {
        h: `Signs they might not be interested`,
        body: [
          {
            ul: [
              `You start every conversation.`,
              `They rarely ask anything about you.`,
              `Plans keep getting a vague "maybe" with no alternative date.`,
              `Replies have become slower and shorter over time.`,
            ],
          },
          `If you notice these, it doesn't mean you did something wrong. Sometimes it's timing, and sometimes it's just not a match.`,
        ],
      },
      {
        h: `The respectful way to find out`,
        body: [
          `Signals are guesses. The clearest way to know is to see how they respond to an honest, low-pressure invitation.`,
          {
            ex: [
              { tone: `With a plan`, text: `I've really liked talking to you. Want to get coffee this weekend?`, why: `A clear invite gets you a clearer answer than any amount of analysis.` },
              { tone: `Light and flirty`, text: `Ok I'm starting to think you're my favorite person to text 😌`, why: `It shows interest openly, and how they react tells you a lot.` },
              { tone: `If you're unsure where things stand`, text: `I'm having fun getting to know you — are you up for meeting up sometime?`, why: `Honest, and easy to say yes or no to.` },
              { tone: `When they reach out first`, text: `Ha, I was just about to text you. How did the exam go?`, why: `Meeting their effort with warmth makes it easy for interest to grow on both sides.` },
            ],
          },
          `If they're interested, they'll usually meet you halfway. If they aren't, a kind "no worries!" keeps things comfortable. And if you get a "haha maybe," we have [a whole guide for that](/en/guide/haha-maybe-reply).`,
        ],
      },
      {
        h: `Don't overthink a single text`,
        body: [
          `It's easy to replay one message a hundred times. Try to zoom out: over the last week or two, is the conversation balanced? Do they seem glad to hear from you? Patterns over time are far more reliable than any one reply, emoji, or delay.`,
        ],
      },
      {
        h: `What texting can't tell you`,
        body: [
          `Some people are warm in person and awkward over text; others are great texters who never follow through. Texts don't carry tone of voice, body language, or how someone acts when you're actually together. If you've met up, how they treat you in person usually says more than any message. If you haven't met yet, that's one more reason to suggest it once the conversation feels good.`,
        ],
      },
    ],
    faq: [
      { q: `How can you tell if someone likes you over text?`, a: `Look for a pattern: they start conversations, ask questions, remember details, reply consistently, and say yes to plans.` },
      { q: `Does a fast reply mean they like me?`, a: `It can, but some people are just fast texters. Consistency and effort matter more than speed.` },
      { q: `How do I know if they're flirting or just being nice?`, a: `Nice people answer; interested people also ask, follow up, and make plans. A low-pressure invite is the clearest test.` },
    ],
    ctaNote: `My Love Coach also estimates their interest level from 0° to 100° as your conversations go on. It's an AI estimate, not a verdict — treat it as one more signal.`,
    q: `Can you tell from our chat whether they're interested in me?`,
  },
  {
    slug: 'rizz-lines',
    title: `Rizz Lines That Actually Work (Without Being Cringe)`,
    h1: `Rizz lines that actually work (without being cringe)`,
    description: `Forget copy-paste pickup lines. What real rizz looks like over text, openers and flirty replies you can adapt, and the lines to avoid.`,
    intro: [
      `Search for "rizz lines" and you'll find hundreds of pickup lines, most of which would make the person on the other end cringe. That's because the lines aren't the rizz. Rizz — real charm — is mostly attention, a bit of confidence, and a sense of humor that fits the moment.`,
      `The best lines are specific to the person you're talking to. Below are lines you can adapt, with the reasoning behind each, so you can write your own.`,
    ],
    sections: [
      {
        h: `What makes a line work`,
        body: [
          {
            ul: [
              `**It's specific.** Mentioning something from their profile, a photo, or your last conversation shows you're actually paying attention.`,
              `**It's easy to answer.** A good opener invites a reply: a question, a playful choice, a small challenge.`,
              `**It's confident but not pushy.** Playful, not sexual, in the first messages. Interested, not intense.`,
              `**It sounds like you.** If you'd never say it out loud, don't text it.`,
            ],
          },
        ],
      },
      {
        h: `Openers you can adapt`,
        body: [
          {
            ex: [
              { tone: `From their profile`, text: `Ok I need the story behind the photo with the goat. There's definitely a story`, why: `Specific, curious, and fun to answer.` },
              { tone: `Playful choice`, text: `Settle something for me: is a hot dog a sandwich? Your answer determines everything`, why: `A silly debate gives you an instant back-and-forth.` },
              { tone: `Honest compliment`, text: `Your taste in music is honestly elite. What should I be listening to right now?`, why: `It compliments a choice they made, then asks a question.` },
              { tone: `Simple and direct`, text: `Hey, your smile in that last photo made me want to say hi. How's your week going?`, why: `Direct without being over the top.` },
            ],
          },
        ],
      },
      {
        h: `Flirty replies once you're talking`,
        body: [
          {
            ex: [
              { tone: `When they tease you`, text: `Wow, roasted. I'll allow it because you're cute`, why: `It plays along and slips in a compliment.` },
              { tone: `When they compliment you`, text: `Careful, I might start believing you. You're not so bad yourself`, why: `It accepts the compliment with humor and returns the energy.` },
              { tone: `Moving toward a date`, text: `You've talked this place up so much I'm going to need you to prove it. This weekend?`, why: `It turns flirting into a plan — which is the real goal.` },
            ],
          },
          `Ready for that last step? Here's [how to ask someone out over text](/en/guide/ask-someone-out-over-text).`,
        ],
      },
      {
        h: `If a line falls flat`,
        body: [
          `Sometimes a joke doesn't land, or gets a confused "huh?". Don't double down or explain the joke for three messages. Laugh at yourself and move on:`,
          {
            ex: [
              { tone: `Recovering`, text: `Ok that sounded way better in my head 😂 anyway, how's your weekend going?`, why: `Owning a miss with humor is genuinely charming, and it resets the conversation.` },
            ],
          },
        ],
      },
      {
        h: `Lines to avoid`,
        body: [
          {
            ul: [
              `Sexual comments or compliments about their body in the first messages. They rarely land and often make people uncomfortable.`,
              `Copy-pasted pickup lines that could be sent to anyone.`,
              `Negging — backhanded compliments meant to knock someone's confidence. That's manipulation, not charm.`,
              `Keeping it going after they're clearly not into it. A short reply or a no is an answer; respect it.`,
            ],
          },
        ],
      },
      {
        h: `The real secret`,
        body: [
          `The most attractive thing you can bring to a conversation is genuine interest in the other person. Ask about what they care about, remember what they told you, and be comfortable being a little silly. That's rizz. The lines are just a way to start.`,
          `And don't worry if a line doesn't land. Not every opener gets a reply, and that says more about timing and fit than about you. Keep it kind, keep it light, and move on gracefully.`,
        ],
      },
    ],
    faq: [
      { q: `Do pickup lines actually work?`, a: `Generic ones rarely do. Specific, playful lines that show you noticed something about the person tend to work much better.` },
      { q: `What's a good first message on a dating app?`, a: `Something specific to their profile plus an easy question. "Ok I need the story behind…" is a reliable format.` },
      { q: `How do I flirt over text without being cringe?`, a: `Keep it light, specific, and responsive to what they say. Match their energy and don't push past their comfort.` },
    ],
    q: `Help me write a first message to my match that isn't cringe.`,
  },
  {
    slug: 'text-after-first-date',
    title: `What to Text After a First Date (Examples + Timing)`,
    h1: `How to text after a first date`,
    description: `When to text after a first date, what to say if you want a second date (or if you don't), and example messages for every situation.`,
    intro: [
      `The first date is over. Now comes the part that somehow feels harder: the first text after. Wait too long and they might think you're not interested; text the second you get home and you worry you look too eager.`,
      `The honest answer: if you had a good time, saying so is never a mistake. Here's when and how.`,
    ],
    sections: [
      {
        h: `When to text`,
        body: [
          `The same night or the next day is the sweet spot. A short message that evening ("Home safe! Had a great time") is warm and normal. There's no need to wait three days — that old rule mostly creates confusion.`,
          `If they text first, great; reply warmly in your own time. If neither of you has texted by the next afternoon, go ahead and be the one.`,
        ],
      },
      {
        h: `If you want a second date`,
        body: [
          {
            ex: [
              { tone: `Warm and simple`, text: `Had a really great time tonight. Hope you got home ok!`, why: `Clear, kind, and easy to reply to.` },
              { tone: `Callback`, text: `Still laughing about the waiter and the birthday song. Thanks for a fun night 😄`, why: `Recalling a shared moment makes the date feel memorable.` },
              { tone: `Asking for round two`, text: `I'd love to do that again. Are you free next week? I owe you that dessert we skipped`, why: `It shows interest and proposes something specific.` },
              { tone: `Low pressure`, text: `Really enjoyed meeting you. If you're up for it, I'd like to see you again`, why: `Honest, and it leaves room for them to answer however they feel.` },
            ],
          },
        ],
      },
      {
        h: `Reading their reply`,
        body: [
          {
            ul: [
              `**Warm, specific, and they suggest a time:** good signs. Lock in a plan.`,
              `**Friendly but vague ("Yeah it was fun!") with no plan:** offer one specific option. If it stays vague, let them come back to you.`,
              `**No reply after a day or two:** one light follow-up is fine. After that, take the hint gracefully.`,
            ],
          },
        ],
      },
      {
        h: `If you're not sure how you feel`,
        body: [
          `Sometimes a first date is fine but not amazing — nerves, a loud venue, a slow start. That's common, and it's okay to give it a second chance if you'd like to know them better. You can be honest without overpromising:`,
          {
            ex: [
              { tone: `Honest and open`, text: `I had a nice time tonight. I'd be up for hanging out again if you are — maybe something more relaxed, like a walk?`, why: `It's sincere, suggests an easier setting, and leaves the decision open for both of you.` },
            ],
          },
        ],
      },
      {
        h: `If you're not feeling it`,
        body: [
          `Not every first date leads to a second, and that's fine. Leaving someone hanging is usually harder on them than a kind, clear message.`,
          {
            ex: [
              { tone: `Kind and clear`, text: `Thanks for meeting up — I had a nice time, but I didn't feel a romantic spark. Wishing you the best!`, why: `Honest and respectful, and it doesn't leave them guessing.` },
            ],
          },
          `If they took the time to meet you, a short message like this is a decent thing to do. If they push back or ask why, you don't owe them a debate. "I just didn't feel it, but I enjoyed meeting you" is enough.`,
        ],
      },
      {
        h: `Avoid these`,
        body: [
          {
            ul: [
              `Asking "so how did I do?" or fishing for a rating.`,
              `Overanalyzing the date in a long message.`,
              `Texting non-stop before the second date — save some conversation for in person.`,
              `Ghosting someone who clearly expects to hear from you.`,
            ],
          },
          `Once you're texting regularly between dates, our [talking stage tips](/en/guide/talking-stage-texting) can help you find a comfortable rhythm.`,
        ],
      },
    ],
    faq: [
      { q: `How long should I wait to text after a first date?`, a: `The same night or the next day is ideal. There's no benefit to waiting several days.` },
      { q: `Who should text first after a first date?`, a: `Whoever wants to. If you had a good time, it's fine to be first.` },
      { q: `What if they don't text back after the first date?`, a: `Give it a day, send one light message if you'd like, and if there's still nothing, move on kindly.` },
    ],
    q: `We just had our first date. What should I text them now?`,
  },
  {
    slug: 'make-up-after-fight-text',
    title: `How to Make Up After a Fight Over Text (What to Say)`,
    h1: `How to make up after a fight over text`,
    description: `How to apologize and make up after a fight over text: when to send it, apology messages that actually help, and what to save for a real conversation.`,
    intro: [
      `After a fight, the silence can feel worse than the argument. You want to fix it, but you're not sure whether to text, what to say, or whether a text will make things worse.`,
      `A good make-up text doesn't try to win the argument or solve everything at once. It lowers the temperature and opens the door to a real conversation — ideally in person or on a call.`,
    ],
    sections: [
      {
        h: `Before you text`,
        body: [
          {
            ul: [
              `**Cool down first.** If you're still angry, anything you send will show it. A few hours, or a night's sleep, helps.`,
              `**Figure out what you're actually sorry for.** A specific apology lands; a vague "sorry if you were upset" doesn't.`,
              `**Decide your goal.** You're not re-arguing, you're reconnecting.`,
              `**If it's serious, plan to talk properly.** Text is for opening the door, not for the whole conversation.`,
            ],
          },
        ],
      },
      {
        h: `Messages that help`,
        body: [
          {
            ex: [
              { tone: `Taking responsibility`, text: `I've been thinking about earlier. I'm sorry I snapped at you — that wasn't fair, and you didn't deserve it.`, why: `It's specific about what you did, with no "but." That's what makes an apology believable.` },
              { tone: `Opening the door`, text: `I hate how we left things. Can we talk tonight? I want to understand where you're coming from.`, why: `It shows you care about them, not just about being right.` },
              { tone: `When you both said things`, text: `I think we both got heated. I'm sorry for my part. I care about you more than this argument.`, why: `It owns your side without demanding they apologize first.` },
              { tone: `Giving space`, text: `I know you might need some time. I'm here when you're ready to talk ❤️`, why: `It respects their pace instead of pushing for an instant fix.` },
            ],
          },
        ],
      },
      {
        h: `Avoid these`,
        body: [
          {
            ul: [
              `"Sorry you feel that way." It sounds like an apology but puts the blame on them.`,
              `"I'm sorry, but…" Everything after "but" cancels the apology.`,
              `Restarting the argument with a long paragraph about your side.`,
              `Pretending nothing happened and sending a meme.`,
              `Sending message after message when they've asked for space.`,
            ],
          },
        ],
      },
      {
        h: `If they reach out first`,
        body: [
          `If they send the first message, meet them halfway. Accepting an apology doesn't mean pretending the issue didn't matter; it means you're both willing to work on it.`,
          {
            ex: [
              { tone: `Meeting them halfway`, text: `Thank you for saying that. I'm sorry too — I didn't handle it well either. Can we talk about it later tonight?`, why: `It accepts the olive branch, owns your part, and moves the real talk to a better moment.` },
            ],
          },
          `Try not to use their apology as a chance to list everything they did wrong. If something still bothers you, bring it up calmly once you're talking properly.`,
        ],
      },
      {
        h: `Take the real talk offline`,
        body: [
          `Once things are calmer, talk on the phone or in person. Tone of voice and facial expressions prevent a lot of the misunderstandings that text creates. Listen first, repeat back what you heard, and talk about what you'll both do differently next time.`,
          `If they don't reply right away, that's okay. One sincere message is enough. Give them the time they need, and avoid following up with a second apology that quietly asks them to hurry up.`,
          `If fights often leave you feeling scared, belittled, or controlled, that isn't a texting problem. It's worth talking to someone you trust or to a professional.`,
        ],
      },
    ],
    faq: [
      { q: `Should you apologize over text?`, a: `Text is a fine way to start an apology and show you care, especially if they need space. Follow up with a real conversation.` },
      { q: `How long should I wait to text after a fight?`, a: `Long enough to be calm — often a few hours or the next day — but not so long that the silence becomes its own problem.` },
      { q: `What if they don't reply to my apology?`, a: `Give them time. One sincere message is enough; repeated messages can feel like pressure.` },
    ],
    q: `We had a fight and I want to make up. What should I text?`,
  },
  {
    slug: 'talking-stage-texting',
    title: `Talking Stage Texting Tips: How Often and What to Say`,
    h1: `Talking stage texting tips`,
    description: `How often to text in the talking stage, what to talk about, signs it's going somewhere, and how to ask "what are we?" without making it weird.`,
    intro: [
      `The talking stage — that in-between time when you're clearly into each other but not officially dating — is fun, exciting, and a little confusing. How often should you text? Is it bad to text every day? When do you ask what this is?`,
      `There's no universal timetable, but there are habits that make the talking stage feel good, and habits that make it drag.`,
    ],
    sections: [
      {
        h: `How often to text`,
        body: [
          `There's no correct number. Plenty of people in a talking stage that's going well text most days, and plenty don't. The healthier question is: does the rhythm feel comfortable for both of you?`,
          {
            ul: [
              `Roughly match their pace. If they reply a few times a day, you don't need to send twenty messages.`,
              `Quality beats quantity. One thoughtful message beats an all-day stream of "wyd."`,
              `It's okay not to reply right away. Having your own life is attractive.`,
            ],
          },
        ],
      },
      {
        h: `What to talk about`,
        body: [
          {
            ul: [
              `Plans and things you're each looking forward to.`,
              `Callbacks to things they told you earlier.`,
              `Light personal questions that go a little deeper over time: "What's something you're proud of this year?"`,
              `Your actual day, with details — not just "good, you?"`,
            ],
          },
        ],
      },
      {
        h: `Messages to try`,
        body: [
          {
            ex: [
              { tone: `Good morning, not generic`, text: `Morning! Good luck with the big presentation — you're going to crush it`, why: `It shows you remember what matters to them.` },
              { tone: `Going a little deeper`, text: `Random question: what's something most people don't know about you?`, why: `It moves past small talk at a comfortable pace.` },
              { tone: `Suggesting a plan`, text: `We've been texting for a while — I'd like to actually hang out. Free this weekend?`, why: `A talking stage without meeting up tends to stall.` },
              { tone: `Asking where you stand`, text: `I really like where this is going. Are you seeing it as something more too?`, why: `Clear and kind, and it lets them answer honestly.` },
            ],
          },
        ],
      },
      {
        h: `Signs it's going somewhere`,
        body: [
          {
            ul: [
              `You both start conversations.`,
              `You've met up — and made more plans.`,
              `They mention future things ("you'd love this place, we should go").`,
              `They're consistent, not hot and cold.`,
            ],
          },
          `For more on reading their texts, see [signs your crush is interested](/en/guide/signs-they-like-you-over-text).`,
        ],
      },
      {
        h: `When to have the "what are we" talk`,
        body: [
          `If you've been seeing each other for a while and you want to know, that's reason enough to ask. In person is best, but a gentle text to open the topic is fine. Be honest about what you want, and be ready to hear an honest answer — even if it's not the one you hoped for. Anyone worth being with will respect you for asking.`,
        ],
      },
      {
        h: `If it starts to feel one-sided`,
        body: [
          `Talking stages often fade quietly instead of ending with a clear conversation. If you're always the one starting chats or making plans, it's okay to ease off and see whether they reach out. You can also just ask, kindly:`,
          {
            ex: [
              { tone: `Honest check-in`, text: `Hey, I've been enjoying this, but I'm getting the sense you might be busy or not feeling it. Totally okay either way — I'd just rather know.`, why: `It's direct without blame, and it gives them an easy way to be honest.` },
            ],
          },
        ],
      },
      {
        h: `Avoid these`,
        body: [
          {
            ul: [
              `Testing them, like waiting to see how long it takes them to text you.`,
              `Getting jealous about people you're not exclusive with yet.`,
              `Texting for months without ever meeting up.`,
            ],
          },
        ],
      },
    ],
    faq: [
      { q: `How long does the talking stage last?`, a: `It varies a lot. If you've been talking for weeks without meeting up or without any clarity, it's fair to suggest a date or ask where things stand.` },
      { q: `Is it bad to text every day in the talking stage?`, a: `Not if you both enjoy it. If it feels one-sided, ease off and see if they reach out.` },
      { q: `How do I ask "what are we" over text?`, a: `Keep it simple and honest: "I really like where this is going. How are you feeling about us?" Save the bigger conversation for in person.` },
    ],
    q: `We're in the talking stage. How often should I text, and how do I ask what we are?`,
  },
  {
    slug: 'text-your-ex',
    title: `Should You Text Your Ex? How to Decide and What to Say`,
    h1: `How to text your ex (and whether you should)`,
    description: `Thinking about texting your ex? Questions to ask yourself first, respectful messages for different situations, and when not to text at all.`,
    intro: [
      `Late at night, a song comes on, and suddenly you're typing your ex's name. Maybe you miss them. Maybe you want closure. Maybe you just want to know they're okay.`,
      `Texting an ex isn't automatically a bad idea — but it's worth being honest with yourself about why you're doing it, and about what you'll do with whatever they say back.`,
    ],
    sections: [
      {
        h: `Ask yourself first`,
        body: [
          {
            ul: [
              `**What do I actually want?** Getting back together, closure, friendship, returning something — or just relief from a lonely night?`,
              `**Am I ready for any answer,** including no answer at all?`,
              `**Has anything changed since the breakup?** If not, the same problems will likely come back.`,
              `**Is it 2am, or have I been drinking?** Write it in your notes app and decide in the morning.`,
            ],
          },
        ],
      },
      {
        h: `Don't text if…`,
        body: [
          {
            ul: [
              `They asked you not to contact them, or blocked you. Respect that — reaching out anyway is not okay.`,
              `The relationship was controlling, abusive, or made you feel unsafe.`,
              `You're hoping to make them jealous or guilty.`,
              `You've already reached out and they didn't respond. That's your answer.`,
            ],
          },
        ],
      },
      {
        h: `If you decide to text`,
        body: [
          `Keep it short, low pressure, and easy to ignore. The goal is to open a door, not to have a big emotional conversation over text.`,
          {
            ex: [
              { tone: `Friendly check-in`, text: `Hey, saw that the band we both liked has a new album and thought of you. Hope you're doing well.`, why: `Warm and light, with no pressure to reply.` },
              { tone: `Closure`, text: `I've been thinking about how things ended. I'm sorry for my part in it. I hope you're doing well — no need to reply.`, why: `It takes responsibility and doesn't ask for anything back.` },
              { tone: `Hoping to reconnect`, text: `I've done a lot of thinking since we split up. Would you be open to getting coffee and talking sometime? Totally okay if not.`, why: `Honest about what you want, and it makes clear that no is a fine answer.` },
              { tone: `Practical`, text: `Hey, I still have your jacket — want me to drop it off or mail it?`, why: `Practical, respectful, and nothing hidden behind it.` },
            ],
          },
        ],
      },
      {
        h: `Avoid these`,
        body: [
          {
            ul: [
              `"I miss you" at 2am with nothing else.`,
              `Long paragraphs reopening the relationship's problems.`,
              `Asking who they're seeing now.`,
              `Inventing a reason to restart contact.`,
            ],
          },
        ],
      },
      {
        h: `If they reply`,
        body: [
          `Take your cue from their tone. If they're friendly but brief, keep it brief too — a pleasant exchange can be a fine ending on its own. If they seem open to more, suggest talking properly rather than having the big conversation over text:`,
          {
            ex: [
              { tone: `Keeping it light`, text: `Really glad to hear things are good. Take care of yourself!`, why: `A warm close when they're polite but not looking to reconnect.` },
              { tone: `If they seem open`, text: `It's really nice to hear from you. Would you want to grab a coffee and catch up properly?`, why: `It moves a delicate conversation somewhere you can actually hear each other.` },
            ],
          },
        ],
      },
      {
        h: `After you hit send`,
        body: [
          `Whatever happens, let their response — or their silence — be the answer. If they're open to talking, take it slow and meet in person; old patterns are easier to notice face to face. If they're not, it hurts, but you've learned something and you can move forward. Talking to a friend often helps more than another message.`,
          `If what you really need is to repair things after a recent argument rather than a breakup, see [how to make up after a fight over text](/en/guide/make-up-after-fight-text).`,
        ],
      },
    ],
    faq: [
      { q: `Is it a good idea to text your ex?`, a: `It depends on why. If you want closure, to apologize, or to reconnect and something has genuinely changed, a short respectful message can be fine. If they asked for no contact, don't.` },
      { q: `What should I text my ex to get them back?`, a: `Be honest, not clever: say you've been reflecting and ask if they'd be open to talking. Then respect their answer.` },
      { q: `How long after a breakup should I wait to text my ex?`, a: `There's no fixed rule. Give yourself enough space to be clear-headed about what you want and why, so you're not texting out of a single lonely moment.` },
    ],
    q: `I'm thinking about texting my ex. Should I, and what should I say?`,
  },
];
