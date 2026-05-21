import { Injectable } from '@nestjs/common';
import {
  assertAiReviewTransition,
  assertExportTransition,
  assertHumanReviewTransition,
  assertSubmissionTransition,
  assertTaskTransition,
  canTransitionAiReview,
  canTransitionExport,
  canTransitionHumanReview,
  canTransitionSubmission,
  canTransitionTask,
  type AiReviewStatus,
  type ExportStatus,
  type HumanReviewStatus,
  type SubmissionStatus,
  type TaskStatus,
} from '@labelhub/shared';

@Injectable()
export class StateMachineService {
  canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
    return canTransitionTask(from, to);
  }

  assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
    assertTaskTransition(from, to);
  }

  canTransitionSubmission(from: SubmissionStatus, to: SubmissionStatus): boolean {
    return canTransitionSubmission(from, to);
  }

  assertSubmissionTransition(from: SubmissionStatus, to: SubmissionStatus): void {
    assertSubmissionTransition(from, to);
  }

  canTransitionAiReview(from: AiReviewStatus, to: AiReviewStatus): boolean {
    return canTransitionAiReview(from, to);
  }

  assertAiReviewTransition(from: AiReviewStatus, to: AiReviewStatus): void {
    assertAiReviewTransition(from, to);
  }

  canTransitionHumanReview(
    from: HumanReviewStatus,
    to: HumanReviewStatus,
  ): boolean {
    return canTransitionHumanReview(from, to);
  }

  assertHumanReviewTransition(
    from: HumanReviewStatus,
    to: HumanReviewStatus,
  ): void {
    assertHumanReviewTransition(from, to);
  }

  canTransitionExport(from: ExportStatus, to: ExportStatus): boolean {
    return canTransitionExport(from, to);
  }

  assertExportTransition(from: ExportStatus, to: ExportStatus): void {
    assertExportTransition(from, to);
  }
}
