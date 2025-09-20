# migration/sqlite_config.py
import os
import sqlite3
from pathlib import Path

class SQLiteConfig:
    """Configuração específica para SQLite"""
    
    def __init__(self):
        # Caminho para o banco antigo (relativo ao diretório migration)
        self.old_db_path = Path(__file__).parent.parent / "database_old.sqlite"
        self.api_base_url = "http://localhost:1425"
        
        # Configurações de migração
        self.batch_size = 10
        self.max_retries = 3
        self.retry_delay = 2
        self.dry_run = False
        
        # Configurações de log
        self.log_level = "INFO"
        self.log_file = "migration.log"
    
    def validate_database(self) -> bool:
        """Valida se o banco antigo existe e tem a estrutura esperada"""
        try:
            if not self.old_db_path.exists():
                print(f"❌ Banco antigo não encontrado: {self.old_db_path}")
                return False
            
            # Conecta e verifica estrutura
            conn = sqlite3.connect(self.old_db_path)
            cursor = conn.cursor()
            
            # Verifica se as tabelas existem
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name IN ('notas_fiscais', 'itens_nota')
            """)
            
            tables = [row[0] for row in cursor.fetchall()]
            
            if 'notas_fiscais' not in tables:
                print("❌ Tabela 'notas_fiscais' não encontrada no banco antigo")
                return False
            
            if 'itens_nota' not in tables:
                print("❌ Tabela 'itens_nota' não encontrada no banco antigo")
                return False
            
            # Conta registros
            cursor.execute("SELECT COUNT(*) FROM notas_fiscais")
            total_notas = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM itens_nota")
            total_itens = cursor.fetchone()[0]
            
            print(f"✅ Banco antigo validado:")
            print(f"   📊 Notas fiscais: {total_notas}")
            print(f"   📦 Itens: {total_itens}")
            
            conn.close()
            return True
            
        except Exception as e:
            print(f"❌ Erro ao validar banco antigo: {e}")
            return False
    
    def get_connection_string(self) -> str:
        """Retorna string de conexão para o banco antigo"""
        return f"sqlite:///{self.old_db_path}"
    
    def get_database_info(self) -> dict:
        """Retorna informações sobre o banco antigo"""
        try:
            conn = sqlite3.connect(self.old_db_path)
            cursor = conn.cursor()
            
            # Informações das tabelas
            cursor.execute("""
                SELECT name, sql FROM sqlite_master 
                WHERE type='table' AND name IN ('notas_fiscais', 'itens_nota')
            """)
            
            tables_info = {}
            for name, sql in cursor.fetchall():
                tables_info[name] = {
                    'create_sql': sql,
                    'columns': []
                }
                
                # Pega colunas da tabela
                cursor.execute(f"PRAGMA table_info({name})")
                columns = cursor.fetchall()
                tables_info[name]['columns'] = [
                    {
                        'name': col[1],
                        'type': col[2],
                        'not_null': bool(col[3]),
                        'default': col[4],
                        'primary_key': bool(col[5])
                    }
                    for col in columns
                ]
            
            # Conta registros
            cursor.execute("SELECT COUNT(*) FROM notas_fiscais")
            total_notas = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM itens_nota")
            total_itens = cursor.fetchone()[0]
            
            conn.close()
            
            return {
                'path': str(self.old_db_path),
                'total_notas': total_notas,
                'total_itens': total_itens,
                'tables': tables_info
            }
            
        except Exception as e:
            return {'error': str(e)}
