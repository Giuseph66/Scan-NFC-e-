#!/usr/bin/env python3
# migration/example_usage.py
# Exemplos de uso do sistema de migração

import sys
from pathlib import Path

# Adiciona o diretório atual ao path
sys.path.append(str(Path(__file__).parent))

from migrate_sqlite import SQLiteMigrator

def example_basic_migration():
    """Exemplo básico de migração"""
    print("📋 Exemplo 1: Migração Básica")
    print("-" * 40)
    
    migrator = SQLiteMigrator()
    
    # Testa configuração
    if migrator.validate_setup():
        print("✅ Configuração OK, iniciando migração...")
        migrator.migrate(limit=5)  # Migra apenas 5 notas como exemplo
    else:
        print("❌ Configuração inválida")

def example_dry_run():
    """Exemplo de dry run"""
    print("\n📋 Exemplo 2: Dry Run (Modo de Teste)")
    print("-" * 40)
    
    migrator = SQLiteMigrator()
    migrator.migrate(limit=3, dry_run=True)

def example_database_info():
    """Exemplo de informações do banco"""
    print("\n📋 Exemplo 3: Informações do Banco")
    print("-" * 40)
    
    from sqlite_config import SQLiteConfig
    
    config = SQLiteConfig()
    info = config.get_database_info()
    
    if 'error' in info:
        print(f"❌ Erro: {info['error']}")
    else:
        print(f"📁 Banco: {info['path']}")
        print(f"📊 Notas: {info['total_notas']}")
        print(f"📦 Itens: {info['total_itens']}")
        
        print("\n🏗️ Estrutura das Tabelas:")
        for table_name, table_info in info['tables'].items():
            print(f"\n📋 {table_name}:")
            for col in table_info['columns']:
                pk = " (PK)" if col['primary_key'] else ""
                nn = " NOT NULL" if col['not_null'] else ""
                print(f"  • {col['name']}: {col['type']}{pk}{nn}")

def main():
    """Executa exemplos"""
    print("🚀 Exemplos de Uso do Sistema de Migração NFC-e")
    print("=" * 60)
    
    # Exemplo 1: Informações do banco
    example_database_info()
    
    # Exemplo 2: Dry run
    example_dry_run()
    
    # Exemplo 3: Migração real (comentado para segurança)
    # example_basic_migration()
    
    print("\n" + "=" * 60)
    print("✅ Exemplos concluídos!")
    print("\n💡 Para executar migração real:")
    print("   python migrate_sqlite.py --limit 10")

if __name__ == "__main__":
    main()
