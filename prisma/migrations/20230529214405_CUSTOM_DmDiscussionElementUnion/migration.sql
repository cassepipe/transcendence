ALTER TABLE "DmDiscussionElement"
  ADD CONSTRAINT message_event_union
  CHECK(COALESCE("eventId" , "messageId") IS NOT NULL)
