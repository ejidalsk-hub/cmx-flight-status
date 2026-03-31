import csv, json, math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / 'data' / 'training' / 'sample_cmx_training.csv'
OUT_PATH = ROOT / 'lib' / 'trained-model.json'
FEATURES = [
    'kind','airline_family','route','month_bucket','hour_bucket','wind_bucket',
    'precip_flag','freezing_flag','fog_flag','status_bucket'
]
TARGETS = ['delayed','cancelled']


def read_rows(path: Path):
    with path.open(newline='') as f:
        return list(csv.DictReader(f))


def train_naive_bayes(rows, target):
    values_by_feature = {feature: sorted({row[feature] for row in rows}) for feature in FEATURES}
    class_counts = Counter(row[target] for row in rows)
    total = sum(class_counts.values())
    priors = {cls: class_counts[cls] / total for cls in ['0','1']}

    likelihoods = {}
    for feature in FEATURES:
        likelihoods[feature] = {}
        for cls in ['0','1']:
            subset = [row for row in rows if row[target] == cls]
            counts = Counter(row[feature] for row in subset)
            k = len(values_by_feature[feature])
            denom = len(subset) + k
            likelihoods[feature][cls] = {
                value: (counts[value] + 1) / denom
                for value in values_by_feature[feature]
            }

    return {
        'priors': priors,
        'likelihoods': likelihoods,
        'valuesByFeature': values_by_feature,
    }


def main():
    rows = read_rows(CSV_PATH)
    model = {
        'features': FEATURES,
        'targets': TARGETS,
        'trainedFrom': CSV_PATH.name,
        'rowCount': len(rows),
        'models': {target: train_naive_bayes(rows, target) for target in TARGETS},
    }
    OUT_PATH.write_text(json.dumps(model, indent=2))
    print(f'Wrote {OUT_PATH}')


if __name__ == '__main__':
    main()
