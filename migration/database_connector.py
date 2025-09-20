# migration/database_connector.py
import sqlite3
import pymysql
import psycopg2
from typing import List, Dict, Any, Optional
import logging
from config import Config

logger = logging.getLogger(__name__)

class DatabaseConnector:
    """Conector para banco de dados antigo"""
    
    def __init__(self):
        self.config = Config()
        self.connection = None
        self.cursor = None
    
    def connect(self):
        """Estabelece conexão com o banco antigo"""
        try:
            if self.config.OLD_DB_TYPE == 'sqlite':
                self.connection = sqlite3.connect(self.config.OLD_DB_FILE)
                self.connection.row_factory = sqlite3.Row  # Para retornar dicts
                
            elif self.config.OLD_DB_TYPE == 'mysql':
                self.connection = pymysql.connect(
                    host=self.config.OLD_DB_HOST,
                    port=self.config.OLD_DB_PORT,
                    user=self.config.OLD_DB_USER,
                    password=self.config.OLD_DB_PASSWORD,
                    database=self.config.OLD_DB_NAME,
                    charset='utf8mb4'
                )
                
            elif self.config.OLD_DB_TYPE == 'postgresql':
                self.connection = psycopg2.connect(
                    host=self.config.OLD_DB_HOST,
                    port=self.config.OLD_DB_PORT,
                    user=self.config.OLD_DB_USER,
                    password=self.config.OLD_DB_PASSWORD,
                    database=self.config.OLD_DB_NAME
                )
                self.connection.autocommit = True
            else:
                raise ValueError(f"Tipo de banco não suportado: {self.config.OLD_DB_TYPE}")
            
            self.cursor = self.connection.cursor()
            logger.info(f"✅ Conectado ao banco {self.config.OLD_DB_TYPE}: {self.config.OLD_DB_NAME}")
            
        except Exception as e:
            logger.error(f"❌ Erro ao conectar no banco: {e}")
            raise
    
    def disconnect(self):
        """Fecha conexão com o banco"""
        if self.cursor:
            self.cursor.close()
        if self.connection:
            self.connection.close()
        logger.info("🔌 Conexão com banco fechada")
    
    def get_tables_info(self) -> List[Dict[str, Any]]:
        """Retorna informações sobre as tabelas do banco"""
        try:
            if self.config.OLD_DB_TYPE == 'sqlite':
                query = """
                SELECT name as table_name, sql as create_sql
                FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """
                
            elif self.config.OLD_DB_TYPE == 'mysql':
                query = """
                SELECT TABLE_NAME as table_name, TABLE_COMMENT as table_comment
                FROM information_schema.TABLES 
                WHERE TABLE_SCHEMA = %s
                ORDER BY TABLE_NAME
                """
                self.cursor.execute(query, (self.config.OLD_DB_NAME,))
                
            elif self.config.OLD_DB_TYPE == 'postgresql':
                query = """
                SELECT table_name, obj_description(c.oid) as table_comment
                FROM information_schema.tables t
                LEFT JOIN pg_class c ON c.relname = t.table_name
                WHERE table_schema = 'public'
                ORDER BY table_name
                """
            
            if self.config.OLD_DB_TYPE == 'sqlite':
                self.cursor.execute(query)
            else:
                self.cursor.execute(query)
            
            tables = []
            for row in self.cursor.fetchall():
                if self.config.OLD_DB_TYPE == 'sqlite':
                    tables.append({
                        'table_name': row[0],
                        'create_sql': row[1],
                        'comment': None
                    })
                else:
                    tables.append({
                        'table_name': row[0],
                        'create_sql': None,
                        'comment': row[1]
                    })
            
            return tables
            
        except Exception as e:
            logger.error(f"❌ Erro ao obter informações das tabelas: {e}")
            return []
    
    def get_notas_fiscais(self, limit: Optional[int] = None, offset: int = 0) -> List[Dict[str, Any]]:
        """Retorna lista de notas fiscais do banco antigo"""
        try:
            # Query baseada na sua query SQL
            query = """
            SELECT 
                id,
                chave,
                versao,
                ambiente,
                cIdToken,
                vSig,
                cnpjEmitente,
                nomeEmitente,
                ieEmitente,
                createdAt,
                updatedAt
            FROM notas_fiscais
            WHERE chave IS NOT NULL 
                AND versao IS NOT NULL 
                AND ambiente IS NOT NULL 
                AND cIdToken IS NOT NULL 
                AND vSig IS NOT NULL
            ORDER BY createdAt DESC
            """
            
            if limit:
                query += f" LIMIT {limit} OFFSET {offset}"
            
            self.cursor.execute(query)
            
            notas = []
            for row in self.cursor.fetchall():
                if self.config.OLD_DB_TYPE == 'sqlite':
                    # SQLite retorna Row objects
                    notas.append(dict(row))
                else:
                    # MySQL/PostgreSQL retorna tuplas
                    columns = [desc[0] for desc in self.cursor.description]
                    notas.append(dict(zip(columns, row)))
            
            logger.info(f"📊 Encontradas {len(notas)} notas fiscais")
            return notas
            
        except Exception as e:
            logger.error(f"❌ Erro ao buscar notas fiscais: {e}")
            return []
    
    def get_itens_nota(self, nota_id: int) -> List[Dict[str, Any]]:
        """Retorna itens de uma nota fiscal específica"""
        try:
            query = """
            SELECT 
                id,
                codigo,
                descricao,
                quantidade,
                unidade,
                valorUnitario,
                valorTotal,
                notaFiscalId,
                createdAt,
                updatedAt
            FROM itens_nota
            WHERE notaFiscalId = %s
            ORDER BY id
            """
            
            self.cursor.execute(query, (nota_id,))
            
            itens = []
            for row in self.cursor.fetchall():
                if self.config.OLD_DB_TYPE == 'sqlite':
                    itens.append(dict(row))
                else:
                    columns = [desc[0] for desc in self.cursor.description]
                    itens.append(dict(zip(columns, row)))
            
            return itens
            
        except Exception as e:
            logger.error(f"❌ Erro ao buscar itens da nota {nota_id}: {e}")
            return []
    
    def get_total_notas(self) -> int:
        """Retorna total de notas fiscais no banco antigo"""
        try:
            query = """
            SELECT COUNT(*) as total
            FROM notas_fiscais
            WHERE chave IS NOT NULL 
                AND versao IS NOT NULL 
                AND ambiente IS NOT NULL 
                AND cIdToken IS NOT NULL 
                AND vSig IS NOT NULL
            """
            
            self.cursor.execute(query)
            result = self.cursor.fetchone()
            
            if self.config.OLD_DB_TYPE == 'sqlite':
                return result['total']
            else:
                return result[0]
                
        except Exception as e:
            logger.error(f"❌ Erro ao contar notas fiscais: {e}")
            return 0
