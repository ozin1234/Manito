import test from "node:test";
import assert from "node:assert/strict";
import { voiceChoice } from "../lib/uwat-types.ts";

const clarify = { id: "q1", kind: "clarify", text: "어떤 상황인가요?", options: [{ id: "1", label: "패인 구멍" }, { id: "2", label: "그림자" }, { id: "3", label: "확인 불가" }] };
const confirm = { id: "q2", kind: "confirm", text: "지도에 저장할까요?", options: [{ id: "confirm", label: "지도에 저장" }, { id: "defer", label: "나중에 확인" }] };
test("voice answers select only options from the active question", () => {
  assert.equal(voiceChoice("이 번", clarify), "2");
  assert.equal(voiceChoice("세 번째", clarify), "3");
  assert.equal(voiceChoice("패인 구멍", clarify), "1");
  assert.equal(voiceChoice("네", clarify), null);
  assert.equal(voiceChoice("네", null), null);
  assert.equal(voiceChoice("이건 구멍이 아닌 것 같아", clarify), null);
});
test("publication consent requires an active confirmation question and an unambiguous answer", () => {
  assert.equal(voiceChoice("네", confirm), "confirm");
  assert.equal(voiceChoice("지도에 저장해줘", confirm), "confirm");
  assert.equal(voiceChoice("아니요", confirm), "defer");
  assert.equal(voiceChoice("네? 아니 위치가 틀렸어", confirm), null);
});
