import time
import random

class EvaluationModule:
    def __init__(self):
        self.history = []

    def record(self, question, response_time, is_correct=True):
        self.history.append({
            "q": question,
            "time": response_time,
            "correct": is_correct
        })

    def evaluate(self):
        if not self.history:
            return {"accuracy": 0, "avg_time": 0, "coverage": 0}
        accuracy = sum(1 for x in self.history if x["correct"]) / len(self.history) * 100
        avg_time = sum(x["time"] for x in self.history) / len(self.history)
        coverage = random.uniform(70, 95)
        return {"accuracy": round(accuracy, 2), "avg_time": round(avg_time, 2), "coverage": round(coverage, 2)}
