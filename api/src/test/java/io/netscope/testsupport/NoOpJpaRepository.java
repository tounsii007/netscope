package io.netscope.testsupport;

import org.springframework.data.domain.Example;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;
import java.util.function.Function;

/**
 * Test-only no-op base implementation of JpaRepository so test stubs only
 * need to override the methods they care about. Avoids needing Mockito to
 * mock the JpaRepository interface (which fails on newer JVMs due to
 * bytecode instrumentation issues).
 */
public abstract class NoOpJpaRepository<T, ID> implements JpaRepository<T, ID> {
    @Override public List<T> findAll() { return List.of(); }
    @Override public List<T> findAll(Sort sort) { return List.of(); }
    @Override public Page<T> findAll(Pageable p) { return Page.empty(); }
    @Override public List<T> findAllById(Iterable<ID> ids) { return List.of(); }
    @Override public <S extends T> List<S> findAll(Example<S> ex) { return List.of(); }
    @Override public <S extends T> List<S> findAll(Example<S> ex, Sort sort) { return List.of(); }
    @Override public <S extends T> Page<S> findAll(Example<S> ex, Pageable p) { return Page.empty(); }
    @Override public long count() { return 0; }
    @Override public <S extends T> long count(Example<S> ex) { return 0; }
    @Override public void deleteById(ID id) {}
    @Override public void delete(T entity) {}
    @Override public void deleteAllById(Iterable<? extends ID> ids) {}
    @Override public void deleteAll(Iterable<? extends T> entities) {}
    @Override public void deleteAll() {}
    @Override public <S extends T> S save(S entity) { return entity; }
    @Override public <S extends T> List<S> saveAll(Iterable<S> entities) {
        List<S> r = new ArrayList<>();
        entities.forEach(r::add);
        return r;
    }
    @Override public Optional<T> findById(ID id) { return Optional.empty(); }
    @Override public boolean existsById(ID id) { return false; }
    @Override public void flush() {}
    @Override public <S extends T> S saveAndFlush(S entity) { return save(entity); }
    @Override public <S extends T> List<S> saveAllAndFlush(Iterable<S> entities) { return saveAll(entities); }
    @Override public void deleteAllInBatch(Iterable<T> entities) {}
    @Override public void deleteAllByIdInBatch(Iterable<ID> ids) {}
    @Override public void deleteAllInBatch() {}
    @Override public T getOne(ID id) { return null; }
    @Override public T getById(ID id) { return null; }
    @Override public T getReferenceById(ID id) { return null; }
    @Override public <S extends T> Optional<S> findOne(Example<S> ex) { return Optional.empty(); }
    @Override public <S extends T> boolean exists(Example<S> ex) { return false; }
    @Override public <S extends T, R> R findBy(Example<S> ex, Function<org.springframework.data.repository.query.FluentQuery.FetchableFluentQuery<S>, R> q) {
        throw new UnsupportedOperationException();
    }
}
