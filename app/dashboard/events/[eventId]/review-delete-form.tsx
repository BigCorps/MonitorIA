"use client";

import { deleteEventReviewAction } from "../actions";
import styles from "./event-detail.module.css";

export function ReviewDeleteForm({
  eventId,
  reviewId,
  detailQuery,
}: {
  eventId: string;
  reviewId: string;
  detailQuery: string;
}) {
  return (
    <form
      action={deleteEventReviewAction}
      className={styles.reviewDeleteForm}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Excluir esta revisão? O estado do acontecimento voltará para a revisão anterior, se houver.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="review_id" value={reviewId} />
      <input
        type="hidden"
        name="detail_query"
        value={detailQuery}
      />
      <button type="submit">Excluir revisão</button>
    </form>
  );
}
