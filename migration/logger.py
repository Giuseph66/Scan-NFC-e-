# migration/logger.py
import logging
import sys
from datetime import datetime
from colorama import init, Fore, Style
from config import Config

# Inicializa colorama para Windows
init(autoreset=True)

class ColoredFormatter(logging.Formatter):
    """Formatter colorido para logs no console"""
    
    COLORS = {
        'DEBUG': Fore.CYAN,
        'INFO': Fore.GREEN,
        'WARNING': Fore.YELLOW,
        'ERROR': Fore.RED,
        'CRITICAL': Fore.MAGENTA + Style.BRIGHT
    }
    
    def format(self, record):
        log_color = self.COLORS.get(record.levelname, '')
        record.levelname = f"{log_color}{record.levelname}{Style.RESET_ALL}"
        record.msg = f"{log_color}{record.msg}{Style.RESET_ALL}"
        return super().format(record)

def setup_logger(name: str = None) -> logging.Logger:
    """Configura sistema de logging"""
    config = Config()
    
    # Cria logger
    logger = logging.getLogger(name or __name__)
    logger.setLevel(getattr(logging, config.LOG_LEVEL.upper()))
    
    # Remove handlers existentes para evitar duplicação
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Handler para console (colorido)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_formatter = ColoredFormatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(message)s',
        datefmt='%H:%M:%S'
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # Handler para arquivo
    file_handler = logging.FileHandler(config.LOG_FILE, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(funcName)s:%(lineno)d | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)
    
    return logger

class MigrationStats:
    """Estatísticas da migração"""
    
    def __init__(self):
        self.start_time = datetime.now()
        self.total_notas = 0
        self.processed_notas = 0
        self.successful_notas = 0
        self.failed_notas = 0
        self.duplicated_notas = 0
        self.errors = []
    
    def add_success(self, nota_id: int, message: str = ""):
        """Adiciona nota processada com sucesso"""
        self.successful_notas += 1
        self.processed_notas += 1
        self.log_progress(f"✅ Nota {nota_id} processada: {message}")
    
    def add_failure(self, nota_id: int, error: str):
        """Adiciona nota com falha"""
        self.failed_notas += 1
        self.processed_notas += 1
        self.errors.append(f"Nota {nota_id}: {error}")
        self.log_progress(f"❌ Nota {nota_id} falhou: {error}")
    
    def add_duplicate(self, nota_id: int, message: str = ""):
        """Adiciona nota duplicada"""
        self.duplicated_notas += 1
        self.processed_notas += 1
        self.log_progress(f"⚠️ Nota {nota_id} duplicada: {message}")
    
    def log_progress(self, message: str):
        """Log de progresso"""
        progress = (self.processed_notas / self.total_notas * 100) if self.total_notas > 0 else 0
        print(f"[{progress:5.1f}%] {message}")
    
    def get_summary(self) -> str:
        """Retorna resumo da migração"""
        duration = datetime.now() - self.start_time
        
        summary = f"""
{'='*60}
📊 RESUMO DA MIGRAÇÃO
{'='*60}
⏱️  Duração: {duration}
📈 Total de notas: {self.total_notas}
✅ Processadas com sucesso: {self.successful_notas}
❌ Falharam: {self.failed_notas}
⚠️  Duplicadas: {self.duplicated_notas}
📊 Taxa de sucesso: {(self.successful_notas / self.total_notas * 100):.1f}%
{'='*60}
        """
        
        if self.errors:
            summary += f"\n❌ ERROS ENCONTRADOS:\n"
            for error in self.errors[:10]:  # Mostra apenas os primeiros 10 erros
                summary += f"  • {error}\n"
            if len(self.errors) > 10:
                summary += f"  ... e mais {len(self.errors) - 10} erros\n"
        
        return summary.strip()
    
    def save_errors_to_file(self, filename: str = "migration_errors.log"):
        """Salva erros em arquivo separado"""
        if not self.errors:
            return
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(f"Erros da migração - {datetime.now()}\n")
            f.write("="*50 + "\n\n")
            for error in self.errors:
                f.write(f"{error}\n")
        
        print(f"📝 Erros salvos em: {filename}")

# Logger global
logger = setup_logger('migration')
