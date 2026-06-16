from abc import ABC, abstractmethod
from typing import List, Tuple, Dict, Any


class BankConnector(ABC):
    @abstractmethod
    def parse(self, content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Returns (rows, errors) where rows are dicts for TransactionCreate"""
        pass

    @classmethod
    @abstractmethod
    def detect(cls, headers: set) -> bool:
        """Returns True if this connector matches the CSV headers"""
        pass
