/**
 * MinPriorityQueue: Efficient Min-Binary-Heap implementation for Dijkstra and A*.
 * Provides O(log N) insertion, O(log N) extraction of minimum, and O(1) peek.
 * Avoids inefficient O(N log N) full-array sorting.
 */
export class MinPriorityQueue {
  constructor() {
    this.heap = [];
    this._counter = 0; // Deterministic tie-breaker
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  peek() {
    if (this.isEmpty()) return null;
    return this.heap[0].element;
  }

  push(element, priority) {
    if (typeof priority !== 'number' || isNaN(priority)) {
      throw new Error(`Invalid priority for MinPriorityQueue: ${priority}`);
    }
    const node = { element, priority, order: this._counter++ };
    this.heap.push(node);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.isEmpty()) return null;
    const min = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this._sinkDown(0);
    }
    return min.element;
  }

  _compare(a, b) {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.order - b.order;
  }

  _bubbleUp(index) {
    let currentIdx = index;
    const node = this.heap[currentIdx];

    while (currentIdx > 0) {
      const parentIdx = Math.floor((currentIdx - 1) / 2);
      const parent = this.heap[parentIdx];

      if (this._compare(node, parent) >= 0) break;

      this.heap[currentIdx] = parent;
      currentIdx = parentIdx;
    }
    this.heap[currentIdx] = node;
  }

  _sinkDown(index) {
    const length = this.heap.length;
    let currentIdx = index;
    const node = this.heap[currentIdx];

    while (true) {
      const leftChildIdx = 2 * currentIdx + 1;
      const rightChildIdx = 2 * currentIdx + 2;
      let swapIdx = null;

      if (leftChildIdx < length) {
        if (this._compare(this.heap[leftChildIdx], node) < 0) {
          swapIdx = leftChildIdx;
        }
      }

      if (rightChildIdx < length) {
        const compareTarget = swapIdx === null ? node : this.heap[leftChildIdx];
        if (this._compare(this.heap[rightChildIdx], compareTarget) < 0) {
          swapIdx = rightChildIdx;
        }
      }

      if (swapIdx === null) break;

      this.heap[currentIdx] = this.heap[swapIdx];
      currentIdx = swapIdx;
    }
    this.heap[currentIdx] = node;
  }

  clear() {
    this.heap = [];
    this._counter = 0;
  }
}

export default MinPriorityQueue;
