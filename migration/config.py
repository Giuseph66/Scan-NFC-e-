# migration/config.py
import os
from dotenv import load_dotenv

# Carrega variáveis de ambiente
load_dotenv()

class Config:
    """Configurações do sistema de migração"""
    
    # Configurações da API do sistema novo
    API_BASE_URL = os.getenv('API_BASE_URL', 'https://teste.neurelix.com.br')
    API_SCAN_ENDPOINT = f"{API_BASE_URL}/api/scan/process"
    
    # Configurações do banco antigo
    OLD_DB_TYPE = os.getenv('OLD_DB_TYPE', 'sqlite')  # sqlite, mysql, postgresql
    OLD_DB_HOST = os.getenv('OLD_DB_HOST', 'localhost')
    OLD_DB_PORT = int(os.getenv('OLD_DB_PORT', '3306'))
    OLD_DB_NAME = os.getenv('OLD_DB_NAME', 'database_old')
    OLD_DB_USER = os.getenv('OLD_DB_USER', 'root')
    OLD_DB_PASSWORD = os.getenv('OLD_DB_PASSWORD', '')
    OLD_DB_FILE = os.getenv('OLD_DB_FILE', 'database_old.sqlite')
    
    # Configurações de migração
    BATCH_SIZE = int(os.getenv('BATCH_SIZE', '10'))
    MAX_RETRIES = int(os.getenv('MAX_RETRIES', '3'))
    RETRY_DELAY = int(os.getenv('RETRY_DELAY', '2'))
    DRY_RUN = os.getenv('DRY_RUN', 'false').lower() == 'true'
    
    # Configurações de log
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', 'migration.log')
    
    @classmethod
    def get_old_db_connection_string(cls):
        """Retorna string de conexão para o banco antigo"""
        if cls.OLD_DB_TYPE == 'sqlite':
            return f"sqlite:///{cls.OLD_DB_FILE}"
        elif cls.OLD_DB_TYPE == 'mysql':
            return f"mysql+pymysql://{cls.OLD_DB_USER}:{cls.OLD_DB_PASSWORD}@{cls.OLD_DB_HOST}:{cls.OLD_DB_PORT}/{cls.OLD_DB_NAME}"
        elif cls.OLD_DB_TYPE == 'postgresql':
            return f"postgresql://{cls.OLD_DB_USER}:{cls.OLD_DB_PASSWORD}@{cls.OLD_DB_HOST}:{cls.OLD_DB_PORT}/{cls.OLD_DB_NAME}"
        else:
            raise ValueError(f"Tipo de banco não suportado: {cls.OLD_DB_TYPE}")
