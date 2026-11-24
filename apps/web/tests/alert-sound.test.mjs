import test from "node:test";
import assert from "node:assert/strict";
import { createAlertSound } from "../lib/alert-sound.ts";

function audioContext(state = "suspended") {
  const events = [];
  const context = { state, currentTime: 5, destination: {}, async resume() { events.push("resume"); context.state = "running"; }, async close() { context.state = "closed"; events.push("close"); }, createGain() { return { connect() {}, gain: { setValueAtTime: (...value) => events.push(["gain", ...value]), exponentialRampToValueAtTime: (...value) => events.push(["fade", ...value]) } }; }, createOscillator() { const oscillator = { frequency: { value: 0 }, connect() {}, start() { events.push(["start", oscillator.frequency.value]); }, stop: (at) => events.push(["stop", at]) }; return oscillator; } };
  return { context, events };
}
test("notification waits for an unlocked audio context and plays one short alert", async () => {
  const { context, events } = audioContext();
  let created = 0;
  const sound = createAlertSound(() => { created++; return context; });
  assert.equal(sound.notify(), false); assert.equal(created, 0);
  assert.equal(await sound.unlock(), true); assert.equal(created, 1);
  assert.equal(sound.notify(), true);
  assert.ok(events.some((event) => Array.isArray(event) && event[0] === "start" && event[1] === 660));
  assert.ok(events.some((event) => Array.isArray(event) && event[0] === "stop" && event[1] === 5.21));
  await sound.unlock(); assert.equal(created, 1);
  await sound.dispose(); assert.equal(context.state, "closed"); assert.equal(sound.notify(), false);
});
test("a blocked audio resume never claims that an alert played", async () => {
  const { context } = audioContext(); context.resume = async () => {};
  const sound = createAlertSound(() => context);
  assert.equal(await sound.unlock(), false); assert.equal(sound.notify(), false);
  await sound.dispose(); assert.equal(await sound.unlock(), false);
});
test("an unsupported audio context reports failure without a microphone or speech service", async () => {
  const sound = createAlertSound(() => { throw new Error("Audio unsupported"); });
  await assert.rejects(sound.unlock(), /Audio unsupported/);
  assert.equal(sound.notify(), false);
});
