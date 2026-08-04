import {
  REFERENCE_SEGMENT_TARGET_BYTES,
  type AggregateReference,
  type LanguageCode,
  type ReferenceSegment,
} from './types';
export { estimateDynamoDbItemSize } from '../../aws/dynamodb/item-size';
import { estimateDynamoDbItemSize } from '../../aws/dynamodb/item-size';

function createReferenceSegment(
  postId: string,
  language: LanguageCode,
  sequence: number,
  references: AggregateReference[]
): ReferenceSegment {
  const paddedSequence = sequence.toString().padStart(6, '0');

  return {
    PK: `POST#${postId}`,
    SK: `REFS#${language}#${paddedSequence}`,
    entityType: 'REFERENCE_SEGMENT',
    schemaVersion: 1,
    postId,
    language,
    sequence,
    version: 1,
    references,
  };
}

export function segmentReferences(
  postId: string,
  language: LanguageCode,
  references: AggregateReference[]
): ReferenceSegment[] {
  const segments: ReferenceSegment[] = [];
  let current: AggregateReference[] = [];

  for (const reference of references) {
    const candidate = createReferenceSegment(
      postId,
      language,
      segments.length,
      [...current, reference]
    );
    const candidateBytes = estimateDynamoDbItemSize(candidate);

    if (current.length > 0 && candidateBytes > REFERENCE_SEGMENT_TARGET_BYTES) {
      segments.push(
        createReferenceSegment(postId, language, segments.length, current)
      );
      current = [reference];
      continue;
    }

    current.push(reference);
  }

  if (current.length > 0) {
    segments.push(
      createReferenceSegment(postId, language, segments.length, current)
    );
  }

  return segments;
}
